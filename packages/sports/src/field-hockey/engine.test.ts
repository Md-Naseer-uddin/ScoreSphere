import { newId } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type HockeyCommand,
  hockeyEngine as engine,
  type HockeyState,
  hockeySuspensions,
} from './engine.js';
import { hockeyPresets } from './settings.js';

const fih = hockeyPresets.find((p) => p.key === 'fih-4x15')!.config;
const A = [newId(), newId()];
const B = [newId(), newId()];
const MIN = 60_000;

/** Commands at the given minutes of wall time. */
function ledger(steps: [number, HockeyCommand][], config = fih): LedgerEvent[] {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'field-hockey',
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
  for (const [minute, payload] of steps) {
    events.push({ seq: events.length + 1, kind: 'COMMAND', occurredAt: minute * MIN, payload });
  }
  return events;
}

function play(steps: [number, HockeyCommand][], config = fih): HockeyState {
  const r = replay(engine, ledger(steps, config));
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: HockeyCommand = { type: 'start_period' };
const end: HockeyCommand = { type: 'end_period' };

describe('hockey engine', () => {
  it('counts suspensions in playing time only, across periods and clock stops', () => {
    const state = play([
      [0, start],
      [14, { type: 'card', side: 1, playerId: B[0]!, color: 'yellow' }],
      [15, end],
      [20, start],
    ]);
    // Shown at 14:00 played, so 5 minutes run out at 19:00 played; the interval doesn't count.
    expect(hockeySuspensions(state, 20 * MIN)).toEqual([
      { side: 1, playerId: B[0], color: 'yellow', remainingMs: 4 * MIN },
    ]);
    expect(hockeySuspensions(state, 24 * MIN)).toEqual([]);
    const stopped = play([
      [0, start],
      [1, { type: 'card', side: 0, playerId: A[0]!, color: 'green' }],
      [2, { type: 'stop_clock' }],
    ]);
    expect(hockeySuspensions(stopped, 30 * MIN)[0]?.remainingMs).toBe(MIN);
  });

  it('lets an umpire make a yellow card longer', () => {
    const state = play([
      [0, start],
      [1, { type: 'card', side: 0, playerId: A[0]!, color: 'yellow', minutes: 10 }],
    ]);
    expect(state.cards[0]?.minutes).toBe(10);
    expect(
      engine.validate(state, { type: 'card', side: 0, playerId: A[1]!, color: 'green', minutes: 4 })
        .ok,
    ).toBe(false);
  });

  it('keeps a red-carded player out of the scoring', () => {
    const state = play([
      [0, start],
      [1, { type: 'card', side: 0, playerId: A[0]!, color: 'red' }],
    ]);
    const goal = (scorerId: string): HockeyCommand => ({
      type: 'goal',
      side: 0,
      kind: 'field_goal',
      scorerId,
    });
    expect(engine.validate(state, goal(A[0]!)).ok).toBe(false);
    expect(engine.validate(state, goal(A[1]!)).ok).toBe(true);
    expect(engine.validate(state, goal(B[0]!)).ok).toBe(false);
  });

  it('stops the clock after goals and penalty corners only when set to', () => {
    const goal: HockeyCommand = { type: 'goal', side: 0, kind: 'field_goal' };
    expect(
      play([
        [0, start],
        [1, goal],
      ]).periods.clock.runningSince,
    ).toBeNull();
    expect(
      play(
        [
          [0, start],
          [1, goal],
        ],
        { ...fih, stopClock: false },
      ).periods.clock.runningSince,
    ).not.toBeNull();
    const after = play([
      [0, start],
      [1, goal],
    ]);
    expect(engine.validate(after, { type: 'stop_clock' }).ok).toBe(false);
    expect(engine.validate(after, { type: 'restart_clock' }).ok).toBe(true);
  });

  it('ends level matches in a draw, or a shoot-out when set', () => {
    const four: [number, HockeyCommand][] = [0, 1, 2, 3].flatMap((q) => [
      [q * 20, start],
      [q * 20 + 15, end],
    ]);
    expect(play(four).outcome).toEqual({ winner: null, finish: 'regular' });
    expect(play(four, { ...fih, shootout: { attempts: 5 } }).phase).toBe('shootout');
  });

  it('keeps the score equal to the goals, replayed or appended, through undos', () => {
    const action = fc.oneof(
      fc.record({ type: fc.constant('goal' as const), side: fc.constantFrom<0 | 1>(0, 1) }),
      fc.record({ type: fc.constant('stroke' as const), scored: fc.boolean() }),
      fc.constant({ type: 'restart' as const }),
      fc.constant({ type: 'undo' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), (actions) => {
        const events = ledger([[0, start]]);
        const first = replay(engine, events);
        if (!first.ok) throw new Error(first.error.message);
        let projection = first.value;
        const done: number[] = [];
        for (const a of actions) {
          const seq = events.length + 1;
          const occurredAt = seq * MIN;
          const payload: HockeyCommand =
            a.type === 'goal'
              ? { type: 'goal', side: a.side, kind: 'field_goal' }
              : a.type === 'stroke'
                ? { type: 'penalty_stroke', side: 1, scored: a.scored }
                : { type: 'restart_clock' };
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
        expect(s.score[0] + s.score[1]).toBe(s.goals.length);
        expect(s.strokes.filter((x) => x.scored).length).toBe(
          s.goals.filter((g) => g.kind === 'penalty_stroke').length,
        );
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(s);
      }),
    );
  });
});
