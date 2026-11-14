import { newId } from '@scoresphere/contracts';
import { type LedgerEvent, replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import {
  criteriaWinner,
  type WrestlingCommand,
  wrestlingEngine as engine,
  type WrestlingState,
} from './engine.js';
import { wrestlingPresets } from './settings.js';

const freestyle = wrestlingPresets[0]!.config;

function play(steps: WrestlingCommand[], config = freestyle): WrestlingState {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'wrestling',
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
      occurredAt: (i + 1) * 10_000,
      payload,
    })),
  ];
  const r = replay(engine, events);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: WrestlingCommand = { type: 'start_period' };
const pts = (side: 0 | 1, value: 1 | 2 | 4 | 5): WrestlingCommand => ({
  type: 'points',
  side,
  value,
});

describe('wrestling engine', () => {
  it('needs exactly one wrestler a side', () => {
    const roster = (n: number) => ({
      sides: [
        { side: 0 as const, participantIds: Array.from({ length: n }, () => newId()) },
        { side: 1 as const, participantIds: [newId()] },
      ],
    });
    expect(engine.validateSetup(freestyle, roster(1)).ok).toBe(true);
    expect(engine.validateSetup(freestyle, roster(2)).ok).toBe(false);
  });

  it('breaks a level bout on cautions, then on the last point scored', () => {
    // Both best actions are 2; B has a caution (A got 1 for it).
    expect(
      criteriaWinner(
        play([start, pts(0, 2), pts(1, 2), { type: 'caution', side: 1, penalty: 1 }, pts(1, 1)]),
      ),
    ).toBe(0);
    expect(criteriaWinner(play([start, pts(0, 2), pts(1, 2)]))).toBe(1);
  });

  it('leaves a bout with no action undecided', () => {
    const state = play([start, { type: 'end_period' }, start, { type: 'end_period' }]);
    expect(state.outcome).toEqual({ winner: null, method: 'criteria' });
    expect(engine.result(state).status).toBe('no_result');
  });

  it('stops the bout at technical superiority, and not before', () => {
    expect(play([start, pts(1, 4), pts(1, 4), pts(1, 1)]).phase).toBe('playing');
    expect(play([start, pts(1, 4), pts(1, 4), pts(1, 2)]).outcome).toEqual({
      winner: 1,
      method: 'technical_superiority',
    });
    expect(engine.validate(play([start, pts(1, 5), pts(1, 5)]), pts(0, 1)).ok).toBe(false);
  });
});
