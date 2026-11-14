import { newId } from '@scoresphere/contracts';
import { type LedgerEvent, replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { basketballEngine } from './basketball/engine.js';
import { basketballPresets } from './basketball/settings.js';
import { cricketEngine } from './cricket/engine.js';
import { runCricketGoldenLog } from './cricket/golden/run.js';
import { cricketPresets } from './cricket/settings.js';

/**
 * Long ledgers replay quickly enough to rebuild a match on a low-end phone after a reload
 * (plan M11: offline stress). The limits are generous; they catch work that grows badly
 * with the length of a match, not small slowdowns.
 */
function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe('replay performance', () => {
  it('replays a full 50-over-a-side cricket match (600+ deliveries)', () => {
    const odi = cricketPresets.find((p) => p.key === 'odi')!.config;
    const over = (bowler: string) => [`bowler ${bowler}`, '1 0 4! 0 2 1'];
    const innings = (bat: 'A' | 'B', bowlers: [string, string]) => [
      `innings ${bat} ${bat === 'A' ? 'a1 a2' : 'b1 b2'}`,
      ...Array.from({ length: 50 }, (_, i) => over(bowlers[i % 2]!)).flat(),
    ];
    const players = (s: string) => Array.from({ length: 11 }, (_, i) => `${s}${i + 1}`);
    const run = runCricketGoldenLog({
      name: 'long',
      source: 'test',
      config: { ...odi, maxOversPerBowler: null },
      players: { A: players('a'), B: players('b') },
      // The chase stops once the target is passed.
      script: [...innings('A', ['b1', 'b2']), ...innings('B', ['a1', 'a2'])],
      expected: { innings: [], summary: '', winner: null },
    });
    expect(run.events.length).toBeGreaterThan(600);
    const { value, ms } = timed(() => replay(cricketEngine, run.events));
    expect(value.ok).toBe(true);
    expect(ms).toBeLessThan(2_000);
  });

  it('replays a basketball game with 1,000 events', () => {
    const fiba = basketballPresets[0]!.config;
    const ids = [
      Array.from({ length: 5 }, () => newId()),
      Array.from({ length: 5 }, () => newId()),
    ];
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: 'basketball',
          presetKey: 'test',
          presetVersion: 1,
          config: fiba,
          roster: { sides: ids.map((participantIds, side) => ({ side, participantIds })) },
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
      { seq: 3, kind: 'COMMAND', occurredAt: 1000, payload: { type: 'start_period' } },
    ];
    for (let i = 0; i < 1000; i++) {
      const side = i % 2;
      events.push({
        seq: events.length + 1,
        kind: 'COMMAND',
        occurredAt: 2000 + i * 500,
        payload:
          i % 5 === 4
            ? { type: 'play', side, kind: 'rebound', playerId: ids[side]![i % 5]! }
            : { type: 'score', side, points: (i % 3) + 1, playerId: ids[side]![i % 5]! },
      });
    }
    const { value, ms } = timed(() => replay(basketballEngine, events));
    expect(value.ok).toBe(true);
    expect(ms).toBeLessThan(2_000);
  });
});
