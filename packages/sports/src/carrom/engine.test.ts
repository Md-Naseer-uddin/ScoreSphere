import { newId } from '@scoresphere/contracts';
import { type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type CarromCommand,
  carromEngine as engine,
  type CarromState,
  nextBreak,
} from './engine.js';
import { carromPresets } from './settings.js';

const oneGame = carromPresets.find((p) => p.key === 'one-game-25')!.config;

function play(steps: CarromCommand[], config = oneGame): CarromState {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'carrom',
        presetKey: 'test',
        presetVersion: 1,
        config,
        roster: {
          sides: [
            { side: 0, participantIds: [newId()] },
            { side: 1, participantIds: [newId()] },
          ],
        },
      },
    },
    { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
    ...steps.map((payload, i) => ({
      seq: i + 3,
      kind: 'COMMAND' as const,
      occurredAt: (i + 1) * 60_000,
      payload,
    })),
  ];
  const r = replay(engine, events);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: CarromCommand = { type: 'start_match', firstBreak: 1 };
const board = (winner: 0 | 1, coinsLeft: number): CarromCommand => ({
  type: 'board',
  winner,
  coinsLeft,
  queenCoveredBy: null,
});

describe('carrom engine', () => {
  it('needs one player a side for singles and two for doubles', () => {
    const roster = (n: number) => ({
      sides: ([0, 1] as const).map((side) => ({
        side,
        participantIds: Array.from({ length: n }, () => newId()),
      })),
    });
    expect(engine.validateSetup(oneGame, roster(1)).ok).toBe(true);
    expect(engine.validateSetup(oneGame, roster(2)).ok).toBe(false);
    expect(engine.validateSetup({ ...oneGame, discipline: 'doubles' }, roster(2)).ok).toBe(true);
  });

  it('alternates the break from board to board', () => {
    expect([
      nextBreak(play([start])),
      nextBreak(play([start, board(0, 1)])),
      nextBreak(play([start, board(0, 1), board(1, 1)])),
    ]).toEqual([1, 0, 1]);
  });

  it('ends every game with a winner and keeps the points equal to the boards', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            winner: fc.constantFrom<0 | 1>(0, 1),
            coins: fc.integer({ min: 0, max: 9 }),
            queen: fc.constantFrom<0 | 1 | null>(0, 1, null),
          }),
          { maxLength: 30 },
        ),
        (boards) => {
          const steps: CarromCommand[] = [start];
          let state = play(steps);
          for (const b of boards) {
            if (state.phase !== 'playing') break;
            steps.push({
              type: 'board',
              winner: b.winner,
              coinsLeft: b.coins,
              queenCoveredBy: b.queen,
            });
            state = play(steps);
          }
          for (const g of state.games) {
            for (const side of [0, 1] as const) {
              expect(g.points[side]).toBe(
                g.boards.filter((x) => x.winner === side).reduce((n, x) => n + x.points, 0),
              );
            }
            if (g.winner !== null)
              expect(g.points[g.winner]).toBeGreaterThan(g.points[g.winner === 0 ? 1 : 0]);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
