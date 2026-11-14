import {
  type MatchEvent,
  type PostMatchEventsResponse,
  postMatchEventsResponseSchema,
} from '@scoresphere/contracts';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSession } from '@/features/auth/session';
import { ApiClientError, apiFetch, json } from '@/lib/api';
import { db, getDeviceId, type LocalDatabase, type LocalMatchEvent } from '@/lib/db';
import { matchHeader } from './local-store';
import { lease } from './matches-api';

const BATCH = 200;
const RETRY_MS = 15_000;

interface SyncState {
  /** Matches with a request in flight. */
  syncing: Record<string, boolean>;
  /** Set when the last attempt couldn't reach the server. */
  unreachable: boolean;
}

export const useSyncState = create<SyncState>(() => ({ syncing: {}, unreachable: false }));

function setSyncing(matchId: string, value: boolean) {
  useSyncState.setState((s) => ({ syncing: { ...s.syncing, [matchId]: value } }));
}

const inflight = new Map<string, Promise<void>>();

/**
 * Pushes a match's pending events to `POST /matches/:id/events` (ADR 0004). One request per
 * match at a time; retries resend the same event IDs, which the server deduplicates.
 */
export function syncMatch(matchId: string, database: LocalDatabase = db): Promise<void> {
  let running = inflight.get(matchId);
  if (!running) {
    running = drain(matchId, database).finally(() => inflight.delete(matchId));
    inflight.set(matchId, running);
  }
  return running;
}

async function drain(matchId: string, database: LocalDatabase): Promise<void> {
  setSyncing(matchId, true);
  try {
    // Keep going while full batches go through; stop on anything else.
    for (let round = 0; round < 50; round++) {
      if ((await pushOnce(matchId, database)) !== 'more') return;
    }
  } finally {
    setSyncing(matchId, false);
  }
}

function toEnvelope(e: LocalMatchEvent): MatchEvent {
  return {
    eventId: e.eventId,
    seq: e.seq,
    kind: e.kind,
    payload: e.payload,
    leaseEpoch: e.leaseEpoch,
    engineVersion: e.engineVersion,
    occurredAt: e.occurredAt,
    ...(e.targetSeq !== null ? { targetSeq: e.targetSeq } : {}),
  } as MatchEvent;
}

async function pushOnce(
  matchId: string,
  database: LocalDatabase,
): Promise<'done' | 'more' | 'stop'> {
  const match = await database.matches.get(matchId);
  if (!match) return 'done';
  const pending = await database.matchEvents
    .where('[matchId+sync]')
    .equals([matchId, 'pending'])
    .sortBy('seq');
  if (pending.length === 0) return 'done';
  const batch = pending.slice(0, BATCH);

  let res: PostMatchEventsResponse;
  try {
    res = await apiFetch(
      `/matches/${matchId}/events`,
      {
        method: 'POST',
        ...json({
          deviceId: await getDeviceId(database),
          ...(match.serverKnown ? {} : { match: matchHeader(match) }),
          events: batch.map(toEnvelope),
        }),
      },
      postMatchEventsResponseSchema,
    );
  } catch (error) {
    const offline =
      error instanceof ApiClientError &&
      (error.code === 'NETWORK_ERROR' || error.code === 'UNAUTHENTICATED' || error.status >= 500);
    useSyncState.setState({ unreachable: offline });
    if (!offline) {
      const message = error instanceof Error ? error.message : 'Sync failed.';
      await database.matches.update(matchId, { syncError: message });
    }
    return 'stop';
  }
  useSyncState.setState({ unreachable: false });

  const bySeq = new Map(batch.map((e) => [e.eventId, e]));
  let lostLease = false;
  await database.transaction('rw', database.matches, database.matchEvents, async () => {
    for (const result of res.results) {
      const event = bySeq.get(result.eventId);
      if (!event) continue;
      const sync =
        result.outcome === 'ACCEPTED' || result.outcome === 'ALREADY_PROCESSED'
          ? 'synced'
          : result.outcome === 'CONFLICT'
            ? 'conflict'
            : 'rejected';
      if (result.code === 'NOT_LEASE_HOLDER' || result.code === 'STALE_EPOCH') lostLease = true;
      await database.matchEvents.update([matchId, event.seq], { sync, code: result.code });
    }
    await database.matches.update(matchId, {
      serverKnown: true,
      needsReview: res.needsReview,
      syncError: null,
      ...(lostLease ? { holdsLease: false } : {}),
    });
  });
  const allAccepted = res.results.every(
    (r) => r.outcome === 'ACCEPTED' || r.outcome === 'ALREADY_PROCESSED',
  );
  return allAccepted && pending.length > BATCH ? 'more' : 'done';
}

/**
 * Checks that the server still has everything this device had acknowledged for a match it
 * scores, and tells spectators the scorer is still here. After a server restore from backup
 * the server may be behind; the events it lost are queued and sent again.
 */
export async function checkServerCopy(
  matchId: string,
  database: LocalDatabase = db,
): Promise<void> {
  const match = await database.matches.get(matchId);
  if (!match?.holdsLease || !match.serverKnown) return;
  let serverVersion: number | null;
  try {
    serverVersion = (await lease(matchId, 'HEARTBEAT')).version;
  } catch (error) {
    if (!(error instanceof ApiClientError)) return;
    if (error.status === 409) {
      await database.matches.update(matchId, { holdsLease: false });
      return;
    }
    if (error.status !== 404) return;
    serverVersion = null;
  }
  const requeued = await database.transaction(
    'rw',
    database.matches,
    database.matchEvents,
    async () => {
      const synced = await database.matchEvents
        .where('[matchId+sync]')
        .equals([matchId, 'synced'])
        .toArray();
      const lost = synced.filter((e) => e.seq > (serverVersion ?? 0));
      for (const e of lost) {
        await database.matchEvents.update([matchId, e.seq], { sync: 'pending', code: null });
      }
      // The server has no record of the match at all: create it again with the header.
      if (serverVersion === null) await database.matches.update(matchId, { serverKnown: false });
      return lost.length;
    },
  );
  if (requeued > 0) await syncMatch(matchId, database);
}

/** Every match of this account that still has events to send. */
export async function syncAllPending(userId: string, database: LocalDatabase = db): Promise<void> {
  const matches = await database.matches.where('ownerUserId').equals(userId).toArray();
  for (const match of matches) {
    const pending = await database.matchEvents
      .where('[matchId+sync]')
      .equals([match.id, 'pending'])
      .count();
    if (pending > 0) await syncMatch(match.id, database);
  }
}

/** Runs sync on start, when the connection returns, and on a timer while signed in. */
export function useMatchSync(): void {
  const userId = useSession((s) => s.user?.id);
  const authenticated = useSession((s) => s.status === 'authenticated');
  useEffect(() => {
    if (!userId) return;
    const run = () => void syncAllPending(userId).catch(() => undefined);
    if (authenticated) run();
    window.addEventListener('online', run);
    const timer = window.setInterval(run, RETRY_MS);
    return () => {
      window.removeEventListener('online', run);
      window.clearInterval(timer);
    };
  }, [userId, authenticated]);
}
