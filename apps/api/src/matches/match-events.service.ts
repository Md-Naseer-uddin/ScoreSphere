import { Inject, Injectable } from '@nestjs/common';
import {
  type EventRejectionCode,
  type EventResult,
  type MatchEvent,
  type MatchHeader,
  type MatchResult,
  type PostMatchEventsRequest,
  type PostMatchEventsResponse,
  type SportKey,
} from '@scoresphere/contracts';
import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type AnySportEngine, getEngine } from '@scoresphere/sports';
import { and, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import {
  matches,
  matchEventRejections,
  matchEvents,
  matchSideParticipants,
  matchSides,
  rosterMembers,
  teams,
} from '../database/schema';
import type { Transaction } from '../database/types';
import { requireWorkspaceRole } from '../workspaces/workspace-access';
import { type MatchRow, toLedgerEvent } from './match-mapper';
import { notifyMatchUpdate } from './match-notify';

export const matchNotFound = () => new ApiError(404, 'NOT_FOUND', 'Match not found.');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Projection = MatchProjection<any, any, any>;

const invalidRequest = (code: string, message: string, field = 'events') =>
  new ApiError(400, 'VALIDATION_ERROR', message, [{ field, code }]);

/**
 * The single write path (ADR 0004): every scoring action, correction and lifecycle change
 * arrives here as a batch of ledger events from the device holding the scorer lease.
 */
@Injectable()
export class MatchEventsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async ingest(
    user: AuthUser,
    matchId: string,
    body: PostMatchEventsRequest,
  ): Promise<PostMatchEventsResponse> {
    return this.db.transaction(async (tx) => {
      let match = await lockMatch(tx, matchId);
      if (!match) {
        match = await this.create(tx, user, matchId, body);
      } else {
        await requireWorkspaceRole(tx, match.workspaceId, user.id, 'SCORER', matchNotFound);
      }
      const engine = getEngine(match.sport as SportKey, match.engineVersion);
      if (!engine) throw new Error(`No engine for ${match.sport}@${match.engineVersion}`);

      const rows = await tx
        .select()
        .from(matchEvents)
        .where(eq(matchEvents.matchId, matchId))
        .orderBy(matchEvents.seq);
      const ledger: LedgerEvent[] = rows.map(toLedgerEvent);
      const known = new Map(rows.map((r) => [r.eventId, r.seq]));
      let projection = ledger.length ? mustReplay(engine, ledger) : null;
      let version = match.version;
      let needsReview = match.needsReview;
      const results: EventResult[] = [];
      const holdsLease = match.leaseDeviceId === body.deviceId;

      for (const event of body.events) {
        const seenSeq = known.get(event.eventId);
        if (seenSeq !== undefined) {
          results.push({
            eventId: event.eventId,
            seq: seenSeq,
            outcome: 'ALREADY_PROCESSED',
            code: null,
          });
          continue;
        }
        const refusal = checkEnvelope(event, match, holdsLease, version, engine);
        if (refusal) {
          results.push({ eventId: event.eventId, seq: event.seq, ...refusal });
          await this.keepRejected(tx, user, matchId, body.deviceId, event, refusal);
          continue;
        }

        let flagged = false;
        if (event.kind === 'CREATED') {
          projection = mustReplay(engine, [toLedger(event)]);
        } else {
          const next = append(engine, projection!, ledger, toLedger(event));
          if (next.ok) {
            projection = next.value;
          } else {
            // Accept and flag: what happened on the field is kept, and a person reviews it (ADR 0009).
            projection = mustReplay(engine, [...ledger, toLedger(event)]);
            flagged = true;
          }
        }
        ledger.push(toLedger(event));
        known.set(event.eventId, event.seq);
        version = event.seq;
        needsReview ||= flagged;
        await tx.insert(matchEvents).values({
          matchId,
          eventId: event.eventId,
          seq: event.seq,
          kind: event.kind,
          payload: event.payload,
          targetSeq: 'targetSeq' in event ? event.targetSeq : null,
          leaseEpoch: event.leaseEpoch,
          engineVersion: event.engineVersion,
          deviceId: body.deviceId,
          occurredAt: new Date(event.occurredAt),
          createdByUserId: user.id,
          flagged,
        });
        results.push({ eventId: event.eventId, seq: event.seq, outcome: 'ACCEPTED', code: null });
      }

      const accepted = version !== match.version;
      if (accepted && projection) {
        await tx
          .update(matches)
          .set({
            version,
            status: projection.status,
            currentState: projection.state,
            result: resultOf(engine, projection),
            startedAt: projection.startedAt === null ? null : new Date(projection.startedAt),
            endedAt: projection.endedAt === null ? null : new Date(projection.endedAt),
            needsReview,
            scorerSeenAt: new Date(),
          })
          .where(eq(matches.id, matchId));
        await notifyMatchUpdate(tx, matchId, version);
      } else if (holdsLease) {
        await tx.update(matches).set({ scorerSeenAt: new Date() }).where(eq(matches.id, matchId));
      }
      return { results, version, leaseEpoch: match.leaseEpoch, needsReview };
    });
  }

  /** Materialises a match created on a device (ADR 0008). The creating device holds epoch 1. */
  private async create(
    tx: Transaction,
    user: AuthUser,
    matchId: string,
    body: PostMatchEventsRequest,
  ): Promise<MatchRow> {
    const first = body.events[0]!;
    if (!body.match) throw matchNotFound();
    if (first.kind !== 'CREATED' || first.seq !== 1 || first.leaseEpoch !== 1) {
      throw invalidRequest('CREATED_FIRST', 'A new match must start with its CREATED event.');
    }
    const header = body.match;
    await requireWorkspaceRole(tx, header.workspaceId, user.id, 'SCORER');

    const created = first.payload;
    const engine = getEngine(created.sport, first.engineVersion);
    if (!engine) {
      throw invalidRequest('ENGINE_VERSION_UNSUPPORTED', 'This app version is not supported.');
    }
    const check = replay(engine, [toLedger(first)]);
    if (!check.ok) throw invalidRequest(check.error.code, check.error.message);
    await assertHeaderMatchesRoster(tx, header, created.roster);

    const inserted = await tx
      .insert(matches)
      .values({
        id: matchId,
        workspaceId: header.workspaceId,
        sport: created.sport,
        engineVersion: first.engineVersion,
        presetKey: created.presetKey,
        presetVersion: created.presetVersion,
        title: header.title,
        resolvedConfig: check.value.created.config,
        currentState: null,
        status: 'scheduled',
        version: 0,
        leaseEpoch: 1,
        leaseDeviceId: body.deviceId,
        leaseUserId: user.id,
        createdByUserId: user.id,
      })
      .onConflictDoNothing()
      .returning({ id: matches.id });
    if (inserted.length) {
      await tx
        .insert(matchSides)
        .values(
          header.sides.map((s) => ({ matchId, side: s.side, name: s.name, teamId: s.teamId })),
        );
      await tx.insert(matchSideParticipants).values(
        header.sides.flatMap((s) =>
          s.participants.map((p, position) => ({
            id: p.participantId,
            matchId,
            side: s.side,
            position,
            displayName: p.displayName,
            rosterMemberId: p.rosterMemberId,
          })),
        ),
      );
    }
    // A concurrent retry may have created it first; either way, continue with the locked row.
    const row = await lockMatch(tx, matchId);
    if (!row) throw new Error('Match vanished after insert');
    if (!inserted.length) {
      await requireWorkspaceRole(tx, row.workspaceId, user.id, 'SCORER', matchNotFound);
    }
    return row;
  }

  private async keepRejected(
    tx: Transaction,
    user: AuthUser,
    matchId: string,
    deviceId: string,
    event: MatchEvent,
    refusal: { outcome: string; code: EventRejectionCode },
  ): Promise<void> {
    await tx
      .insert(matchEventRejections)
      .values({
        matchId,
        eventId: event.eventId,
        seq: event.seq,
        kind: event.kind,
        payload: event.payload,
        targetSeq: 'targetSeq' in event ? event.targetSeq : null,
        leaseEpoch: event.leaseEpoch,
        engineVersion: event.engineVersion,
        deviceId,
        occurredAt: new Date(event.occurredAt),
        createdByUserId: user.id,
        outcome: refusal.outcome,
        code: refusal.code,
      })
      .onConflictDoNothing();
  }
}

export async function lockMatch(tx: Transaction, matchId: string): Promise<MatchRow | undefined> {
  const [row] = await tx.select().from(matches).where(eq(matches.id, matchId)).for('update');
  return row;
}

function toLedger(event: MatchEvent): LedgerEvent {
  return {
    seq: event.seq,
    kind: event.kind,
    payload: event.payload,
    targetSeq: 'targetSeq' in event ? event.targetSeq : null,
    occurredAt: event.occurredAt,
  };
}

function mustReplay(engine: AnySportEngine, ledger: LedgerEvent[]): Projection {
  const r = replay(engine, ledger, { lenient: true });
  // Only a structurally broken ledger fails a lenient replay, and ingest never stores one.
  if (!r.ok) throw new Error(`Stored ledger does not replay: ${r.error.code} at ${r.error.seq}`);
  return r.value;
}

/** Transport-level checks, in order: lease, epoch, engine version, sequence, payload shape. */
function checkEnvelope(
  event: MatchEvent,
  match: MatchRow,
  holdsLease: boolean,
  version: number,
  engine: AnySportEngine,
): { outcome: 'REJECTED' | 'CONFLICT'; code: EventRejectionCode } | null {
  if (!holdsLease) return { outcome: 'CONFLICT', code: 'NOT_LEASE_HOLDER' };
  if (event.leaseEpoch !== match.leaseEpoch) return { outcome: 'CONFLICT', code: 'STALE_EPOCH' };
  if (event.engineVersion !== match.engineVersion) {
    return { outcome: 'REJECTED', code: 'ENGINE_VERSION_MISMATCH' };
  }
  if (event.seq <= version) return { outcome: 'CONFLICT', code: 'SEQ_TAKEN' };
  if (event.seq > version + 1) return { outcome: 'REJECTED', code: 'SEQ_GAP' };
  if (event.kind === 'CREATED' && event.seq !== 1)
    return { outcome: 'REJECTED', code: 'BAD_PAYLOAD' };
  if (
    (event.kind === 'COMMAND' || event.kind === 'REPLACE') &&
    !engine.commandSchema.safeParse(event.payload).success
  ) {
    return { outcome: 'REJECTED', code: 'BAD_PAYLOAD' };
  }
  return null;
}

function resultOf(engine: AnySportEngine, p: Projection): MatchResult {
  if (p.status === 'abandoned') return { status: 'abandoned', summary: 'Abandoned' };
  return engine.result(p.state);
}

/**
 * The header must name exactly the roster's participants, and any team or roster member
 * it references must belong to the match's workspace.
 */
async function assertHeaderMatchesRoster(
  tx: Transaction,
  header: MatchHeader,
  roster: { sides: { side: number; participantIds: string[] }[] },
): Promise<void> {
  for (const side of header.sides) {
    const expected = roster.sides.find((s) => s.side === side.side)?.participantIds ?? [];
    const actual = side.participants.map((p) => p.participantId);
    if (expected.join() !== actual.join()) {
      throw invalidRequest('ROSTER_MISMATCH', 'The players do not match the match setup.', 'match');
    }
  }
  if (header.sides[0]!.side === header.sides[1]!.side) {
    throw invalidRequest('ROSTER_MISMATCH', 'The two sides must differ.', 'match');
  }
  const teamIds = header.sides.flatMap((s) => (s.teamId ? [s.teamId] : []));
  if (teamIds.length) {
    const found = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(inArray(teams.id, teamIds), eq(teams.workspaceId, header.workspaceId)));
    if (found.length !== new Set(teamIds).size) {
      throw invalidRequest('UNKNOWN_TEAM', 'A team is not in this workspace.', 'match');
    }
  }
  const memberIds = header.sides.flatMap((s) =>
    s.participants.flatMap((p) => (p.rosterMemberId ? [p.rosterMemberId] : [])),
  );
  if (memberIds.length) {
    const found = await tx
      .select({ id: rosterMembers.id })
      .from(rosterMembers)
      .where(
        and(
          inArray(rosterMembers.id, memberIds),
          eq(rosterMembers.workspaceId, header.workspaceId),
          eq(rosterMembers.status, 'ACTIVE'),
        ),
      );
    if (found.length !== new Set(memberIds).size) {
      throw invalidRequest('UNKNOWN_ROSTER_MEMBER', 'A player is not on this roster.', 'match');
    }
  }
}
