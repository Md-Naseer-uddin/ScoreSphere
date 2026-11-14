import { Inject, Injectable } from '@nestjs/common';
import type { AwardRecord, SelectAwardRequest, SideIndex, SportKey } from '@scoresphere/contracts';
import { type AwardOutcome, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type AnySportEngine, getEngine, matchAwardDefinitions } from '@scoresphere/sports';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { awardRecords, matchEvents, matches, matchSideParticipants } from '../database/schema';
import type { DbExecutor, Transaction } from '../database/types';
import { toLedgerEvent } from '../matches/match-mapper';
import { requireWorkspaceRole } from '../workspaces/workspace-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Projection = MatchProjection<any, any, any>;
type AwardRow = typeof awardRecords.$inferSelect;
type Recipient = { participantId: string; side: number };

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Match not found.');

export interface AwardContext {
  id: string;
  sport: string;
  engineVersion: number;
  status: string;
  needsReview: boolean;
  version: number;
}

function sameOutcome(row: AwardRow, outcome: AwardOutcome): boolean {
  const ids = (r: Recipient[]) =>
    r
      .map((x) => x.participantId)
      .sort()
      .join();
  return (
    ids(row.recipients as Recipient[]) === ids(outcome.recipients) &&
    JSON.stringify(row.metrics) === JSON.stringify(outcome.metrics)
  );
}

/**
 * Match awards (ADR 0023). Automatic awards follow the scorecard: recomputed whenever a
 * completed match changes, withdrawn if it reopens. An organizer's choice is never replaced
 * automatically; if the match changes afterwards it is marked STALE for them to review.
 * Awards are held back while the match needs review (ADR 0009).
 */
@Injectable()
export class AwardsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async refresh(
    tx: Transaction,
    match: AwardContext,
    projection: Projection | null,
  ): Promise<void> {
    const engine = getEngine(match.sport as SportKey, match.engineVersion);
    const definitions = matchAwardDefinitions(match.sport as SportKey, match.engineVersion);
    if (!engine || definitions.length === 0) return;
    const current = await tx
      .select()
      .from(awardRecords)
      .where(
        and(
          eq(awardRecords.matchId, match.id),
          inArray(awardRecords.status, ['PUBLISHED', 'STALE']),
        ),
      );
    const eligible = match.status === 'completed' && !match.needsReview && projection !== null;
    const stats = eligible ? engine.stats(projection.state) : [];

    for (const definition of definitions) {
      const existing = current.find((r) => r.awardKey === definition.key);
      const computed = eligible ? definition.compute(projection.state, stats) : null;
      if (existing && existing.provenance !== 'AUTO') {
        if (existing.status === 'PUBLISHED' && match.version > existing.matchVersion) {
          await tx
            .update(awardRecords)
            .set({ status: 'STALE' })
            .where(eq(awardRecords.id, existing.id));
        }
        continue;
      }
      if (existing && computed && sameOutcome(existing, computed)) continue;
      if (existing) await this.supersede(tx, existing.id);
      if (computed) {
        await tx.insert(awardRecords).values({
          matchId: match.id,
          awardKey: definition.key,
          criteriaVersion: definition.criteriaVersion,
          status: 'PUBLISHED',
          provenance: 'AUTO',
          recipients: computed.recipients,
          metrics: computed.metrics,
          matchVersion: match.version,
        });
      }
    }
  }

  async list(user: AuthUser, matchId: string): Promise<AwardRecord[]> {
    const match = await this.matchFor(this.db, user, matchId, 'VIEWER');
    return this.records(this.db, match);
  }

  /** An organizer picks the recipient: a manual award, or an override of the automatic one. */
  async select(
    user: AuthUser,
    matchId: string,
    awardKey: string,
    body: SelectAwardRequest,
  ): Promise<AwardRecord[]> {
    return this.db.transaction(async (tx) => {
      const match = await this.matchFor(tx, user, matchId, 'ADMIN', true);
      const definition = this.definition(match, awardKey);
      if (match.status !== 'completed' || match.needsReview) {
        throw new ApiError(
          409,
          'CONFLICT',
          'Awards can be chosen once the match is complete and reviewed.',
        );
      }
      const participants = await tx
        .select()
        .from(matchSideParticipants)
        .where(
          and(
            eq(matchSideParticipants.matchId, matchId),
            inArray(matchSideParticipants.id, body.participantIds),
          ),
        );
      if (participants.length !== new Set(body.participantIds).size) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Choose players from this match.', [
          { field: 'participantIds', code: 'NOT_IN_MATCH' },
        ]);
      }
      const { state } = await this.project(tx, match);
      const engine = getEngine(match.sport as SportKey, match.engineVersion)!;
      const automatic = definition.compute(state, engine.stats(state)) !== null;
      if (automatic && !body.reason) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Give a reason for overriding the automatic award.',
          [{ field: 'reason', code: 'REQUIRED' }],
        );
      }
      const existing = await this.current(tx, matchId, awardKey);
      if (existing) await this.supersede(tx, existing.id);
      const provenance = automatic ? 'OVERRIDE' : 'MANUAL';
      await tx.insert(awardRecords).values({
        matchId,
        awardKey,
        criteriaVersion: definition.criteriaVersion,
        status: 'PUBLISHED',
        provenance,
        recipients: participants.map((p) => ({ participantId: p.id, side: p.side })),
        metrics: {},
        reason: body.reason,
        matchVersion: match.version,
        selectedByUserId: user.id,
      });
      await this.audit.record(
        {
          action: 'award.selected',
          entityType: 'match',
          entityId: matchId,
          actorUserId: user.id,
          workspaceId: match.workspaceId,
          metadata: { awardKey, provenance, participantIds: body.participantIds },
        },
        tx,
      );
      return this.records(tx, match);
    });
  }

  /** Withdraws an organizer's choice; the automatic award (if any) applies again. */
  async revert(user: AuthUser, matchId: string, awardKey: string): Promise<AwardRecord[]> {
    return this.db.transaction(async (tx) => {
      const match = await this.matchFor(tx, user, matchId, 'ADMIN', true);
      this.definition(match, awardKey);
      const existing = await this.current(tx, matchId, awardKey);
      if (!existing || existing.provenance === 'AUTO') return this.records(tx, match);
      await this.supersede(tx, existing.id);
      await this.refresh(tx, match, await this.project(tx, match));
      await this.audit.record(
        {
          action: 'award.reverted',
          entityType: 'match',
          entityId: matchId,
          actorUserId: user.id,
          workspaceId: match.workspaceId,
          metadata: { awardKey },
        },
        tx,
      );
      return this.records(tx, match);
    });
  }

  private definition(match: AwardContext, awardKey: string) {
    const definition = matchAwardDefinitions(match.sport as SportKey, match.engineVersion).find(
      (d) => d.key === awardKey,
    );
    if (!definition) throw new ApiError(404, 'NOT_FOUND', 'This sport has no such award.');
    return definition;
  }

  private async matchFor(
    db: DbExecutor,
    user: AuthUser,
    matchId: string,
    role: 'VIEWER' | 'ADMIN',
    lock = false,
  ) {
    const query = db.select().from(matches).where(eq(matches.id, matchId));
    const [match] = lock ? await query.for('update') : await query;
    if (!match) throw notFound();
    await requireWorkspaceRole(db, match.workspaceId, user.id, role, notFound);
    return match;
  }

  private async current(tx: DbExecutor, matchId: string, awardKey: string) {
    const [row] = await tx
      .select()
      .from(awardRecords)
      .where(
        and(
          eq(awardRecords.matchId, matchId),
          eq(awardRecords.awardKey, awardKey),
          inArray(awardRecords.status, ['PUBLISHED', 'STALE']),
        ),
      );
    return row;
  }

  private async supersede(tx: DbExecutor, id: string) {
    await tx
      .update(awardRecords)
      .set({ status: 'SUPERSEDED', supersededAt: new Date() })
      .where(eq(awardRecords.id, id));
  }

  private async project(tx: DbExecutor, match: AwardContext): Promise<Projection> {
    const engine = getEngine(match.sport as SportKey, match.engineVersion) as AnySportEngine;
    const rows = await tx
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, match.id))
      .orderBy(matchEvents.seq);
    const r = replay(engine, rows.map(toLedgerEvent), { lenient: true });
    if (!r.ok) throw new Error('Stored ledger does not replay');
    return r.value;
  }

  private async records(db: DbExecutor, match: AwardContext): Promise<AwardRecord[]> {
    const definitions = matchAwardDefinitions(match.sport as SportKey, match.engineVersion);
    const [rows, participants] = await Promise.all([
      db
        .select()
        .from(awardRecords)
        .where(
          and(
            eq(awardRecords.matchId, match.id),
            inArray(awardRecords.status, ['PUBLISHED', 'STALE']),
          ),
        ),
      db.select().from(matchSideParticipants).where(eq(matchSideParticipants.matchId, match.id)),
    ]);
    const names = new Map(participants.map((p) => [p.id, p.displayName]));
    return definitions.flatMap((definition) => {
      const row = rows.find((r) => r.awardKey === definition.key);
      if (!row) return [];
      return [
        {
          id: row.id,
          awardKey: row.awardKey,
          name: definition.name,
          criteria: definition.criteria,
          criteriaVersion: row.criteriaVersion,
          status: row.status as AwardRecord['status'],
          provenance: row.provenance as AwardRecord['provenance'],
          recipients: (row.recipients as Recipient[]).map((r) => ({
            participantId: r.participantId,
            side: r.side as SideIndex,
            displayName: names.get(r.participantId) ?? '?',
          })),
          metrics: row.metrics as Record<string, number>,
          reason: row.reason,
          publishedAt: row.publishedAt.toISOString(),
        },
      ];
    });
  }
}
