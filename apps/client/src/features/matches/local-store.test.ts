import { newId } from '@scoresphere/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDatabase } from '@/lib/db';
import { newBadmintonMatch } from '@/test/matches';
import { matchEvents, recordEvent } from './local-store';

let database: LocalDatabase;
let name: string;

const rally = (winner: 0 | 1) => ({ kind: 'COMMAND' as const, payload: { type: 'rally', winner } });
const startGame = { kind: 'COMMAND' as const, payload: { type: 'start_game', servingSide: 0 } };

beforeEach(async () => {
  name = `test-${newId()}`;
  database = new LocalDatabase(name);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

async function created() {
  const r = await newBadmintonMatch(database);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('local match store', () => {
  it('creates a match on the device holding the lease, with CREATED and START queued', async () => {
    const id = await created();
    const match = await database.matches.get(id);
    expect(match).toMatchObject({
      status: 'live',
      version: 2,
      holdsLease: true,
      serverKnown: false,
      leaseEpoch: 1,
    });
    const events = await matchEvents(id, database);
    expect(events.map((e) => [e.seq, e.kind, e.sync])).toEqual([
      [1, 'CREATED', 'pending'],
      [2, 'LIFECYCLE', 'pending'],
    ]);
  });

  it('records valid events and refuses invalid ones without writing them', async () => {
    const id = await created();
    const refused = await recordEvent(id, rally(0), database);
    expect(!refused.ok && refused.error.code).toBe('ENGINE_REJECTED');
    expect(await matchEvents(id, database)).toHaveLength(2);

    await recordEvent(id, startGame, database);
    await recordEvent(id, rally(0), database);
    const r = await recordEvent(id, rally(1), database);
    expect(r.ok).toBe(true);
    expect(await database.matches.get(id)).toMatchObject({ version: 5, resultSummary: '1–1' });
  });

  it('undoes with VOID and keeps the undone event', async () => {
    const id = await created();
    await recordEvent(id, startGame, database);
    await recordEvent(id, rally(0), database);
    await recordEvent(id, { kind: 'VOID', payload: {}, targetSeq: 4 }, database);
    expect(await database.matches.get(id)).toMatchObject({ version: 5, resultSummary: '' });
    expect((await matchEvents(id, database)).map((e) => e.kind)).toEqual([
      'CREATED',
      'LIFECYCLE',
      'COMMAND',
      'COMMAND',
      'VOID',
    ]);
  });

  it('survives a reload: a fresh connection reads the same ledger', async () => {
    const id = await created();
    await recordEvent(id, startGame, database);
    await recordEvent(id, rally(1), database);
    database.close();
    const reopened = new LocalDatabase(name);
    const events = await matchEvents(id, reopened);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    const next = await recordEvent(id, rally(1), reopened);
    expect(next.ok).toBe(true);
    reopened.close();
    await database.open();
  });

  it('refuses scoring once another device holds the lease', async () => {
    const id = await created();
    await database.matches.update(id, { holdsLease: false });
    const r = await recordEvent(id, startGame, database);
    expect(!r.ok && r.error.code).toBe('NOT_SCORER');
  });
});
