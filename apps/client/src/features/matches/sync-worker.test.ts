import { newId, type PostMatchEventsRequest } from '@scoresphere/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/lib/db';
import { mockApi, ok } from '@/test/fetch-mock';
import { signIn } from '@/test/session';
import { matchEvents, recordEvent } from './local-store';
import { newBadmintonMatch } from '@/test/matches';
import { syncMatch, useSyncState } from './sync-worker';

let database: LocalDatabase;

beforeEach(async () => {
  signIn();
  database = new LocalDatabase(`sync-${newId()}`);
  await database.open();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await database.delete();
});

async function created() {
  const r = await newBadmintonMatch(database);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** A server that accepts everything, remembering what it received. */
function acceptingServer(matchId: string) {
  const bodies: PostMatchEventsRequest[] = [];
  const api = mockApi({
    [`POST /matches/${matchId}/events`]: (init) => {
      const body = JSON.parse(init.body as string) as PostMatchEventsRequest;
      bodies.push(body);
      return ok({
        results: body.events.map((e) => ({
          eventId: e.eventId,
          seq: e.seq,
          outcome: 'ACCEPTED',
          code: null,
        })),
        version: body.events[body.events.length - 1]!.seq,
        leaseEpoch: 1,
        needsReview: false,
      });
    },
  });
  return { bodies, api };
}

describe('sync worker', () => {
  it('sends the header with the first batch, then only events', async () => {
    const id = await created();
    const { bodies } = acceptingServer(id);
    await syncMatch(id, database);
    expect(bodies[0]!.match?.sides.map((s) => s.name)).toEqual(['Asha', 'Ravi']);
    expect(bodies[0]!.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(await database.matches.get(id)).toMatchObject({ serverKnown: true });

    await recordEvent(
      id,
      { kind: 'COMMAND', payload: { type: 'start_game', servingSide: 0 } },
      database,
    );
    await syncMatch(id, database);
    expect(bodies[1]!.match).toBeUndefined();
    expect(bodies[1]!.events.map((e) => e.seq)).toEqual([3]);
    expect((await matchEvents(id, database)).every((e) => e.sync === 'synced')).toBe(true);
  });

  it('keeps events pending while offline and resends the same IDs later', async () => {
    const id = await created();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await syncMatch(id, database);
    expect(useSyncState.getState().unreachable).toBe(true);
    const pending = await matchEvents(id, database);
    expect(pending.every((e) => e.sync === 'pending')).toBe(true);

    const { bodies } = acceptingServer(id);
    await syncMatch(id, database);
    expect(bodies[0]!.events.map((e) => e.eventId)).toEqual(pending.map((e) => e.eventId));
    expect(useSyncState.getState().unreachable).toBe(false);
  });

  it('marks events refused after a takeover as conflicts and gives up the lease', async () => {
    const id = await created();
    mockApi({
      [`POST /matches/${id}/events`]: (init) => {
        const body = JSON.parse(init.body as string) as PostMatchEventsRequest;
        return ok({
          results: body.events.map((e) => ({
            eventId: e.eventId,
            seq: e.seq,
            outcome: 'CONFLICT',
            code: 'NOT_LEASE_HOLDER',
          })),
          version: 7,
          leaseEpoch: 2,
          needsReview: false,
        });
      },
    });
    await syncMatch(id, database);
    expect((await matchEvents(id, database)).map((e) => e.sync)).toEqual(['conflict', 'conflict']);
    expect(await database.matches.get(id)).toMatchObject({ holdsLease: false });
  });

  it('runs one request per match at a time', async () => {
    const id = await created();
    const { api } = acceptingServer(id);
    await Promise.all([syncMatch(id, database), syncMatch(id, database), syncMatch(id, database)]);
    expect(api.fetchMock).toHaveBeenCalledTimes(1);
  });
});
