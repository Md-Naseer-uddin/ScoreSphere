import type {
  LiveEvent,
  LiveSnapshot,
  MatchStatus,
  SideIndex,
  SportKey,
} from '@scoresphere/contracts';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { getAccessToken, refreshSession } from '@/features/auth/session';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db, type LocalMatch, type LocalMatchEvent } from '@/lib/db';
import { openEventStream, type StreamStatus } from '@/lib/event-stream';
import { type AnyProjection, engineFor, matchEvents, project, toLedger } from './local-store';
import { useSyncState } from './sync-worker';

/** The six states the scorer always sees (spec frontend §11). */
export type SyncDisplay = 'synced' | 'offline' | 'pending' | 'syncing' | 'failed' | 'conflict';

export function useLocalMatch(matchId: string | undefined) {
  return useLiveQuery(async () => {
    if (!matchId) return null;
    const match = await db.matches.get(matchId);
    if (!match) return null;
    const events = await matchEvents(matchId);
    return { match, events };
  }, [matchId]);
}

export function useMatchSyncStatus(
  match: LocalMatch | null | undefined,
  events: LocalMatchEvent[] | undefined,
): { state: SyncDisplay; pending: number } {
  const online = useOnlineStatus();
  const unreachable = useSyncState((s) => s.unreachable);
  const syncing = useSyncState((s) => (match ? Boolean(s.syncing[match.id]) : false));
  const count = (state: LocalMatchEvent['sync']) =>
    events?.filter((e) => e.sync === state).length ?? 0;
  const pending = count('pending');
  let state: SyncDisplay = 'synced';
  if (count('conflict') > 0 || (match && !match.holdsLease && pending > 0)) state = 'conflict';
  else if (count('rejected') > 0 || match?.syncError) state = 'failed';
  else if (!online || (unreachable && pending > 0)) state = 'offline';
  else if (syncing) state = 'syncing';
  else if (pending > 0) state = 'pending';
  return { state, pending };
}

export interface SideView {
  side: SideIndex;
  name: string;
  participants: { participantId: string; displayName: string }[];
}

/** Replays a ledger with the match's pinned engine; memoised on the ledger version. */
export function useProjection(
  sport: SportKey | undefined,
  engineVersion: number | undefined,
  events:
    | readonly {
        seq: number;
        kind: LiveEvent['kind'];
        payload: unknown;
        targetSeq: number | null;
        occurredAt: number;
      }[]
    | undefined,
): AnyProjection | null {
  const version = events?.length ? events[events.length - 1]!.seq : 0;
  return useMemo(() => {
    if (!sport || !engineVersion || !events?.length) return null;
    try {
      const engine = engineFor(sport, engineVersion);
      return project(
        engine,
        events
          .filter((e) => e.seq > 0)
          .map((e) => toLedger({ ...e, payload: e.payload as Record<string, unknown> })),
      );
    } catch {
      return null;
    }
    // The ledger only grows, so its last seq identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, engineVersion, version, events?.length]);
}

export interface LiveView {
  snapshot: Omit<LiveSnapshot, 'events'> | null;
  events: LiveEvent[];
  status: MatchStatus | null;
  scorerSeenAt: string | null;
  connection: StreamStatus;
  /** HTTP status that closed the stream for good (e.g. 404 for a revoked link). */
  closedWith: number | null;
}

/**
 * Follows a match over SSE: a snapshot, then deltas. Used by the public live page (share
 * token) and by workspace members watching a match scored on another device.
 */
export function useLiveStream(
  path: string | null,
  headers: () => Record<string, string>,
  authenticated: boolean,
): LiveView {
  const [view, setView] = useState<LiveView>({
    snapshot: null,
    events: [],
    status: null,
    scorerSeenAt: null,
    connection: 'connecting',
    closedWith: null,
  });

  useEffect(() => {
    if (!path) return;
    return openEventStream(path, {
      headers: () => {
        const token = authenticated ? getAccessToken() : null;
        return { ...headers(), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      },
      onUnauthorized: authenticated ? () => refreshSession() : undefined,
      onStatus: (connection, httpStatus) =>
        setView((v) => ({ ...v, connection, closedWith: httpStatus ?? v.closedWith })),
      onMessage: (type, data) => {
        if (type === 'snapshot') {
          const { events, ...snapshot } = data as LiveSnapshot;
          setView((v) => ({
            ...v,
            snapshot,
            events,
            status: snapshot.status,
            scorerSeenAt: snapshot.scorerSeenAt,
          }));
        } else if (type === 'delta') {
          const delta = data as {
            events: LiveEvent[];
            status: MatchStatus;
            scorerSeenAt: string | null;
          };
          setView((v) => {
            const last = v.events.length ? v.events[v.events.length - 1]!.seq : 0;
            return {
              ...v,
              events: [...v.events, ...delta.events.filter((e) => e.seq > last)],
              status: delta.status,
              scorerSeenAt: delta.scorerSeenAt,
            };
          });
        }
      },
    });
    // `headers` is read on each connect; reconnecting when its identity changes isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, authenticated]);

  return view;
}

/** A live match whose scorer hasn't reached the server for this long is shown as stale. */
export const STALE_AFTER_MS = 90_000;

export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
