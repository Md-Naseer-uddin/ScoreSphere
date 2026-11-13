import { Inject, Injectable } from '@nestjs/common';
import {
  hasRole,
  type LeaseRequest,
  type LeaseResponse,
  type MatchDetail,
  type MatchStatus,
  type MatchSummary,
  type SideIndex,
  type StoredMatchEvent,
} from '@scoresphere/contracts';
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import type { AuthUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { matches, matchEvents, matchSideParticipants, matchSides } from '../database/schema';
import type { DbExecutor } from '../database/types';
import { requireWorkspaceRole, type WorkspaceContext } from '../workspaces/workspace-access';
import { lockMatch, matchNotFound } from './match-events.service';
import { type MatchRow, toStoredEvent, toSummary } from './match-mapper';
import { notifyMatchUpdate } from './match-notify';

export interface ListMatchesQuery {
  status?: MatchStatus;
  before?: Date;
  limit: number;
}

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Newest first, for the history screen. */
  async list(ctx: WorkspaceContext, query: ListMatchesQuery): Promise<MatchSummary[]> {
    const rows = await this.db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.workspaceId, ctx.workspaceId),
          query.status ? eq(matches.status, query.status) : undefined,
          query.before ? lt(matches.updatedAt, query.before) : undefined,
        ),
      )
      .orderBy(desc(matches.updatedAt))
      .limit(query.limit);
    const sides = rows.length
      ? await this.db
          .select()
          .from(matchSides)
          .where(
            inArray(
              matchSides.matchId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    return rows.map((r) => toSummary(r, sides));
  }

  /** Header, participants and the full ledger, so a device can replay or take over. */
  async detail(user: AuthUser, matchId: string): Promise<MatchDetail> {
    const match = await this.access(user, matchId, 'VIEWER');
    const [sides, participants, events] = await Promise.all([
      this.db.select().from(matchSides).where(eq(matchSides.matchId, matchId)),
      this.db
        .select()
        .from(matchSideParticipants)
        .where(eq(matchSideParticipants.matchId, matchId))
        .orderBy(asc(matchSideParticipants.side), asc(matchSideParticipants.position)),
      this.eventsAfter(matchId, 0),
    ]);
    return {
      ...toSummary(match, sides),
      sides: sides
        .sort((a, b) => a.side - b.side)
        .map((s) => ({
          side: s.side as SideIndex,
          name: s.name,
          teamId: s.teamId,
          participants: participants
            .filter((p) => p.side === s.side)
            .map((p) => ({
              participantId: p.id,
              displayName: p.displayName,
              rosterMemberId: p.rosterMemberId,
            })),
        })),
      events,
    };
  }

  async events(user: AuthUser, matchId: string, after: number): Promise<StoredMatchEvent[]> {
    await this.access(user, matchId, 'VIEWER');
    return this.eventsAfter(matchId, after);
  }

  private async eventsAfter(matchId: string, after: number): Promise<StoredMatchEvent[]> {
    const rows = await this.db
      .select()
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, matchId), gt(matchEvents.seq, after)))
      .orderBy(asc(matchEvents.seq));
    return rows.map(toStoredEvent);
  }

  /**
   * One scorer device per match (ADR 0007). Moving the lease to another device bumps the
   * epoch, so events the old device still has queued are refused and kept for review.
   */
  async lease(user: AuthUser, matchId: string, req: LeaseRequest): Promise<LeaseResponse> {
    return this.db.transaction(async (tx) => {
      const match = await lockMatch(tx, matchId);
      if (!match) throw matchNotFound();
      const ctx = await requireWorkspaceRole(
        tx,
        match.workspaceId,
        user.id,
        'SCORER',
        matchNotFound,
      );
      const mine = match.leaseDeviceId === req.deviceId;
      const busy = () =>
        new ApiError(409, 'CONFLICT', 'Another device is scoring this match.', [
          { field: 'deviceId', code: 'LEASE_HELD' },
        ]);
      let update: Partial<MatchRow> = {};

      switch (req.action) {
        case 'CLAIM':
          if (!mine && match.leaseDeviceId !== null) throw busy();
          if (!mine) update = this.moveLease(match, user, req.deviceId);
          break;
        case 'TAKEOVER':
          if (!mine) {
            const allowed = hasRole(ctx.role, 'ADMIN') || match.leaseUserId === user.id;
            if (!allowed) {
              throw new ApiError(
                403,
                'FORBIDDEN',
                'Only a workspace admin or the current scorer can take over this match.',
              );
            }
            update = this.moveLease(match, user, req.deviceId);
          }
          break;
        case 'RELEASE':
          if (!mine) throw busy();
          update = { leaseDeviceId: null, leaseUserId: null };
          break;
        case 'HEARTBEAT':
          if (!mine) throw busy();
          break;
      }
      const scorerSeenAt = req.action === 'RELEASE' ? match.scorerSeenAt : new Date();
      const [row] = await tx
        .update(matches)
        .set({ ...update, scorerSeenAt })
        .where(eq(matches.id, matchId))
        .returning();
      await notifyMatchUpdate(tx, matchId, row!.version);
      return {
        leaseEpoch: row!.leaseEpoch,
        leaseDeviceId: row!.leaseDeviceId,
        version: row!.version,
      };
    });
  }

  private moveLease(match: MatchRow, user: AuthUser, deviceId: string): Partial<MatchRow> {
    return { leaseDeviceId: deviceId, leaseUserId: user.id, leaseEpoch: match.leaseEpoch + 1 };
  }

  /** Workspace members only; others get 404 so match IDs reveal nothing. */
  async access(
    user: AuthUser,
    matchId: string,
    role: 'VIEWER' | 'SCORER',
    db: DbExecutor = this.db,
  ): Promise<MatchRow> {
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) throw matchNotFound();
    await requireWorkspaceRole(db, match.workspaceId, user.id, role, matchNotFound);
    return match;
  }
}
