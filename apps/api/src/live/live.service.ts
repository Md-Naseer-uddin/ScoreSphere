import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatedShareLink,
  LiveDelta,
  LiveSnapshot,
  MatchStatus,
  ShareLink,
  SideIndex,
  SportKey,
} from '@scoresphere/contracts';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { Subscription } from 'rxjs';
import { ApiError } from '../common/api-error';
import { randomToken, sha256Hex } from '../common/crypto';
import { DB, type Database } from '../database/database.module';
import {
  matches,
  matchEvents,
  matchShareLinks,
  matchSideParticipants,
  matchSides,
} from '../database/schema';
import { toLiveEvent } from '../matches/match-mapper';
import { notifyMatchUpdate } from '../matches/match-notify';
import { MatchUpdatesListener } from './match-updates.listener';

const HEARTBEAT_MS = 20_000;
type LinkRow = typeof matchShareLinks.$inferSelect;
type EventRow = typeof matchEvents.$inferSelect;

/** Server time now, and how far the scoring device's clock is from it (latest event). */
function clockSync(events: EventRow[]) {
  const latest = events.reduce<EventRow | undefined>(
    (a, e) => (!a || e.seq > a.seq ? e : a),
    undefined,
  );
  return {
    serverNow: new Date().toISOString(),
    scorerClockOffsetMs: latest ? latest.receivedAt.getTime() - latest.occurredAt.getTime() : null,
  };
}

const linkNotValid = (code: 'LINK_INVALID' | 'LINK_REVOKED' | 'LINK_EXPIRED') =>
  new ApiError(404, 'NOT_FOUND', 'This live link is not valid any more.', [
    { field: 'token', code },
  ]);

function toShareLink(row: LinkRow, now = new Date()): ShareLink {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    active: !row.revokedAt && (!row.expiresAt || row.expiresAt > now),
  };
}

/**
 * Read-only live views of a match: in-app for workspace members, and through share links
 * for anyone holding one (ADR 0021). Spectators get the ledger and replay it with the same
 * engine the scorer uses, so both always agree.
 */
@Injectable()
export class LiveService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly listener: MatchUpdatesListener,
  ) {}

  async createLink(
    matchId: string,
    userId: string,
    expiresInHours: number | null,
  ): Promise<CreatedShareLink> {
    const token = randomToken(32);
    const [row] = await this.db
      .insert(matchShareLinks)
      .values({
        matchId,
        tokenHash: sha256Hex(token),
        createdByUserId: userId,
        expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3_600_000) : null,
      })
      .returning();
    return { ...toShareLink(row!), token };
  }

  async listLinks(matchId: string): Promise<ShareLink[]> {
    const rows = await this.db
      .select()
      .from(matchShareLinks)
      .where(eq(matchShareLinks.matchId, matchId))
      .orderBy(desc(matchShareLinks.createdAt));
    return rows.map((r) => toShareLink(r));
  }

  /** Revoking also wakes open streams so they close straight away. */
  async revokeLink(matchId: string, linkId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(matchShareLinks)
        .set({ revokedAt: new Date() })
        .where(and(eq(matchShareLinks.id, linkId), eq(matchShareLinks.matchId, matchId)))
        .returning();
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Share link not found.');
      await notifyMatchUpdate(tx, matchId, 0);
    });
  }

  /** The match a share token opens, or a 404 that says why. */
  async resolveToken(token: string | undefined): Promise<string> {
    if (!token || token.length > 100) throw linkNotValid('LINK_INVALID');
    const [row] = await this.db
      .select()
      .from(matchShareLinks)
      .where(eq(matchShareLinks.tokenHash, sha256Hex(token)));
    if (!row) throw linkNotValid('LINK_INVALID');
    if (row.revokedAt) throw linkNotValid('LINK_REVOKED');
    if (row.expiresAt && row.expiresAt <= new Date()) throw linkNotValid('LINK_EXPIRED');
    return row.matchId;
  }

  async snapshot(matchId: string): Promise<LiveSnapshot> {
    const [[match], sides, participants, events] = await Promise.all([
      this.db.select().from(matches).where(eq(matches.id, matchId)),
      this.db.select().from(matchSides).where(eq(matchSides.matchId, matchId)),
      this.db
        .select()
        .from(matchSideParticipants)
        .where(eq(matchSideParticipants.matchId, matchId))
        .orderBy(asc(matchSideParticipants.position)),
      this.db
        .select()
        .from(matchEvents)
        .where(eq(matchEvents.matchId, matchId))
        .orderBy(asc(matchEvents.seq)),
    ]);
    if (!match) throw new ApiError(404, 'NOT_FOUND', 'Match not found.');
    return {
      matchId,
      sport: match.sport as SportKey,
      engineVersion: match.engineVersion,
      title: match.title,
      status: match.status as MatchStatus,
      version: match.version,
      scorerSeenAt: match.scorerSeenAt?.toISOString() ?? null,
      ...clockSync(events),
      sides: sides
        .sort((a, b) => a.side - b.side)
        .map((s) => ({
          side: s.side as SideIndex,
          name: s.name,
          participants: participants
            .filter((p) => p.side === s.side)
            .map((p) => ({ participantId: p.id, displayName: p.displayName })),
        })),
      events: events.map(toLiveEvent),
    };
  }

  async delta(matchId: string, after: number): Promise<LiveDelta> {
    const [[match], events] = await Promise.all([
      this.db.select().from(matches).where(eq(matches.id, matchId)),
      this.db
        .select()
        .from(matchEvents)
        .where(and(eq(matchEvents.matchId, matchId), gt(matchEvents.seq, after)))
        .orderBy(asc(matchEvents.seq)),
    ]);
    if (!match) throw new ApiError(404, 'NOT_FOUND', 'Match not found.');
    return {
      version: events.length ? events[events.length - 1]!.seq : after,
      status: match.status as MatchStatus,
      scorerSeenAt: match.scorerSeenAt?.toISOString() ?? null,
      ...clockSync(await this.latestEvent(matchId, events)),
      events: events.map(toLiveEvent),
    };
  }

  private async latestEvent(matchId: string, recent: EventRow[]): Promise<EventRow[]> {
    if (recent.length) return recent;
    return this.db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId))
      .orderBy(desc(matchEvents.seq))
      .limit(1);
  }

  /**
   * Streams a match as Server-Sent Events: a `snapshot` first (or only what was missed,
   * when the client resumes with `Last-Event-ID`), then a `delta` after every committed
   * change. `stillAllowed` is re-checked on every wake-up, so a revoked or expired link
   * ends the stream with a `revoked` event.
   */
  stream(
    req: Request,
    res: Response,
    matchId: string,
    stillAllowed: () => Promise<boolean> = async () => true,
  ): void {
    const resumeFrom = Number(req.headers['last-event-id']);
    let sent: number | null = Number.isInteger(resumeFrom) && resumeFrom > 0 ? resumeFrom : null;
    let closed = false;
    let queue = Promise.resolve();
    let subscription: Subscription | null = null;

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const write = (type: string, data: unknown, id?: number) => {
      if (closed) return;
      res.write(
        `event: ${type}\n${id !== undefined ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`,
      );
    };
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      subscription?.unsubscribe();
      res.end();
    };
    const wake = () => {
      queue = queue
        .then(async () => {
          if (closed) return;
          if (!(await stillAllowed())) {
            write('revoked', {});
            return close();
          }
          if (sent === null) {
            const snapshot = await this.snapshot(matchId);
            sent = snapshot.version;
            write('snapshot', snapshot, snapshot.version);
          } else {
            const delta = await this.delta(matchId, sent);
            sent = delta.version;
            write('delta', delta, delta.version);
          }
        })
        .catch(() => close());
    };

    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n');
      // Expiry has no notification of its own, so the heartbeat re-checks access too.
      queue = queue
        .then(async () => {
          if (!closed && !(await stillAllowed())) {
            write('revoked', {});
            close();
          }
        })
        .catch(() => close());
    }, HEARTBEAT_MS);
    subscription = this.listener.updates(matchId).subscribe(wake);
    req.on('close', close);
    wake();
  }
}
