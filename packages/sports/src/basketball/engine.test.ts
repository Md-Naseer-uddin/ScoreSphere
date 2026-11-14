import { newId } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  basketballClockLeft,
  type BasketballCommand,
  basketballEngine as engine,
  type BasketballState,
  inPenalty,
  teamFouls,
  timeoutsLeft,
} from './engine.js';
import { basketballPresets } from './settings.js';

const fiba = basketballPresets.find((p) => p.key === 'fiba-4x10')!.config;
const A = [newId(), newId()];
const B = [newId(), newId()];
const SEC = 1000;

function ledger(steps: (BasketballCommand | 'PAUSE' | 'RESUME')[], config = fiba): LedgerEvent[] {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'basketball',
        presetKey: 'test',
        presetVersion: 1,
        config,
        roster: {
          sides: [
            { side: 0, participantIds: A },
            { side: 1, participantIds: B },
          ],
        },
      },
    },
    { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
  ];
  for (const step of steps) {
    const seq = events.length + 1;
    const occurredAt = (seq - 2) * 10 * SEC;
    events.push(
      typeof step === 'string'
        ? { seq, kind: 'LIFECYCLE', occurredAt, payload: { action: step } }
        : { seq, kind: 'COMMAND', occurredAt, payload: step },
    );
  }
  return events;
}

function play(steps: (BasketballCommand | 'PAUSE' | 'RESUME')[], config = fiba): BasketballState {
  const r = replay(engine, ledger(steps, config));
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: BasketballCommand = { type: 'start_period' };
const end: BasketballCommand = { type: 'end_period' };
const foul = (side: 0 | 1, playerId?: string): BasketballCommand => ({
  type: 'foul',
  side,
  kind: 'personal',
  ...(playerId ? { playerId } : {}),
});

describe('basketball engine', () => {
  it('runs the game clock only while the scorer has it running', () => {
    // Start at 10 s, stop at 20 s, start at 30 s: at 60 s, 40 s have been played.
    const state = play([start, { type: 'stop_clock' }, { type: 'start_clock' }]);
    expect(basketballClockLeft(state, 60 * SEC)).toBe(10 * 60 * SEC - 40 * SEC);
    expect(engine.validate(state, { type: 'start_clock' }).ok).toBe(false);
  });

  it('stops the clock for a timeout and a pause', () => {
    const timeout = play([start, { type: 'timeout', side: 0 }]);
    expect(timeout.periods.clock.runningSince).toBeNull();
    const paused = play([start, 'PAUSE', 'RESUME']);
    expect(paused.periods.clock.runningSince).toBeNull();
  });

  it('allows two timeouts in the first half, three in the second, one per overtime', () => {
    const t: BasketballCommand = { type: 'timeout', side: 1 };
    expect(timeoutsLeft(play([start, t, end, start]), 1)).toBe(1);
    expect(engine.validate(play([start, t, end, start, t]), t).ok).toBe(false);
    expect(timeoutsLeft(play([start, t, t, end, start, end, start]), 1)).toBe(3);
    const toOvertime = [start, end, start, end, start, end, start, end, start];
    expect(timeoutsLeft(play(toOvertime), 1)).toBe(1);
  });

  it('counts team fouls per quarter, with overtime fouls in the fourth', () => {
    const q1 = play([start, foul(0), foul(0), foul(0), foul(0)]);
    expect(teamFouls(q1, 0)).toBe(4);
    expect(inPenalty(q1, 0)).toBe(true);
    expect(teamFouls(play([start, foul(0), end, start]), 0)).toBe(0);
    const ot = play([
      start,
      end,
      start,
      end,
      start,
      end,
      start,
      foul(1),
      foul(1),
      end,
      start,
      foul(1),
    ]);
    expect(teamFouls(ot, 1)).toBe(3);
  });

  it('keeps a player out of the game after a disqualifying foul', () => {
    const state = play([start, { type: 'foul', side: 0, kind: 'disqualifying', playerId: A[0]! }]);
    expect(state.disqualified).toEqual([A[0]]);
    expect(engine.validate(state, { type: 'score', side: 0, points: 2, playerId: A[0]! }).ok).toBe(
      false,
    );
    expect(engine.validate(state, foul(0, A[0]!)).ok).toBe(false);
  });

  it('allows an assist only on a teammate’s field goal', () => {
    const state = play([start]);
    const score = (points: 1 | 2 | 3, assistId: string) =>
      engine.validate(state, { type: 'score', side: 0, points, playerId: A[0]!, assistId }).ok;
    expect(score(2, A[1]!)).toBe(true);
    expect(score(1, A[1]!)).toBe(false);
    expect(score(3, A[0]!)).toBe(false);
    expect(score(3, B[0]!)).toBe(false);
  });

  it('keeps the score equal to the baskets, replayed or appended, through undos', () => {
    const action = fc.oneof(
      fc.record({
        type: fc.constant('score' as const),
        side: fc.constantFrom<0 | 1>(0, 1),
        points: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
      }),
      fc.constant({ type: 'undo' as const }),
      fc.constant({ type: 'period' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const events = ledger([start]);
        const first = replay(engine, events);
        if (!first.ok) throw new Error(first.error.message);
        let projection = first.value;
        const done: number[] = [];
        for (const a of actions) {
          const seq = events.length + 1;
          const occurredAt = seq * 10 * SEC;
          const payload: BasketballCommand =
            a.type === 'score'
              ? { type: 'score', side: a.side, points: a.points }
              : projection.state.phase === 'playing'
                ? end
                : start;
          const event: LedgerEvent =
            a.type === 'undo'
              ? { seq, kind: 'VOID', occurredAt, targetSeq: done.at(-1) ?? 0, payload: {} }
              : { seq, kind: 'COMMAND', occurredAt, payload };
          const next = append(engine, projection, events, event);
          if (!next.ok) continue;
          events.push(event);
          projection = next.value;
          if (a.type === 'undo') done.pop();
          else done.push(seq);
        }
        const s = projection.state;
        for (const side of [0, 1] as const) {
          const baskets = s.baskets
            .filter((b) => b.side === side)
            .reduce((n, b) => n + b.points, 0);
          expect(s.score[side]).toBe(baskets);
          expect(s.periodScores.reduce((n, p) => n + p[side], 0)).toBe(baskets);
        }
        if (s.outcome) expect(s.score[0]).not.toBe(s.score[1]);
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(s);
      }),
    );
  });
});
