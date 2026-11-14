import { newId } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bonusLive,
  isDoOrDie,
  type KabaddiCommand,
  kabaddiEngine as engine,
  type KabaddiState,
  kabaddiTimeoutsLeft,
} from './engine.js';
import { kabaddiPresets } from './settings.js';

const modern = kabaddiPresets.find((p) => p.key === 'modern-2x20')!.config;
const A = Array.from({ length: 7 }, () => newId());
const B = Array.from({ length: 7 }, () => newId());

function ledger(steps: KabaddiCommand[], config = modern): LedgerEvent[] {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'kabaddi',
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
  for (const payload of steps) {
    const seq = events.length + 1;
    events.push({ seq, kind: 'COMMAND', occurredAt: seq * 20_000, payload });
  }
  return events;
}

function play(steps: KabaddiCommand[], config = modern): KabaddiState {
  const r = replay(engine, ledger(steps, config));
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: KabaddiCommand = { type: 'start_period', firstRaid: 0 };
const raid = (
  side: 0 | 1,
  touches: number,
  result: 'safe' | 'tackled' | 'out' = 'safe',
  bonus = false,
): KabaddiCommand => ({
  type: 'raid',
  side,
  touches,
  bonus,
  result,
});

describe('kabaddi engine', () => {
  it('makes teams take turns to raid', () => {
    expect(engine.validate(play([start]), raid(1, 0)).ok).toBe(false);
    expect(engine.validate(play([start, raid(0, 0)]), raid(1, 0)).ok).toBe(true);
  });

  it('allows a bonus only with six or more defenders', () => {
    const five = play([start, raid(0, 2), raid(1, 0)]);
    expect(bonusLive(five, 1)).toBe(false);
    expect(engine.validate(five, raid(0, 0, 'safe', true)).ok).toBe(false);
    expect(engine.validate(play([start]), raid(0, 0, 'safe', true)).ok).toBe(true);
  });

  it('refuses touches on a failed raid and more touches than defenders', () => {
    expect(engine.validate(play([start]), raid(0, 1, 'tackled')).ok).toBe(false);
    expect(engine.validate(play([start]), raid(0, 8)).ok).toBe(false);
  });

  it('marks the third raid after two empty ones as do-or-die', () => {
    const state = play([start, raid(0, 0), raid(1, 0), raid(0, 0), raid(1, 0)]);
    expect(isDoOrDie(state, 0)).toBe(true);
    expect(
      isDoOrDie(
        play([start, raid(0, 0), raid(1, 0), raid(0, 0), raid(1, 0)], {
          ...modern,
          doOrDie: false,
        }),
        0,
      ),
    ).toBe(false);
    // A failed do-or-die raid puts the raider out and gives the defence a point.
    const after = play([start, raid(0, 0), raid(1, 0), raid(0, 0), raid(1, 0), raid(0, 0)]);
    expect(after.score).toEqual([0, 1]);
    expect(after.onMat).toEqual([6, 7]);
  });

  it('counts two timeouts per half', () => {
    const t: KabaddiCommand = { type: 'timeout', side: 1 };
    expect(kabaddiTimeoutsLeft(play([start, t, { type: 'start_clock' }]), 1)).toBe(1);
    expect(engine.validate(play([start, t, { type: 'start_clock' }, t]), t).ok).toBe(false);
    expect(
      kabaddiTimeoutsLeft(play([start, t, { type: 'end_period' }, { type: 'start_period' }]), 1),
    ).toBe(2);
  });

  it('keeps players on the mat within the team, and the score equal to the raids', () => {
    const step = fc.oneof(
      fc.record({
        type: fc.constant('raid' as const),
        touches: fc.integer({ min: 0, max: 7 }),
        result: fc.constantFrom('safe' as const, 'tackled' as const, 'out' as const),
        bonus: fc.boolean(),
      }),
      fc.constant({ type: 'undo' as const }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const events = ledger([start]);
        const first = replay(engine, events);
        if (!first.ok) throw new Error(first.error.message);
        let projection = first.value;
        const done: number[] = [];
        for (const s of steps) {
          const seq = events.length + 1;
          const occurredAt = seq * 20_000;
          const event: LedgerEvent =
            s.type === 'undo'
              ? { seq, kind: 'VOID', occurredAt, targetSeq: done.at(-1) ?? 0, payload: {} }
              : {
                  seq,
                  kind: 'COMMAND',
                  occurredAt,
                  payload: {
                    type: 'raid',
                    side: projection.state.nextRaid,
                    touches: s.result === 'safe' ? s.touches : 0,
                    bonus: s.bonus && s.result !== 'out',
                    result: s.result,
                  },
                };
          const next = append(engine, projection, events, event);
          if (!next.ok) continue;
          events.push(event);
          projection = next.value;
          if (s.type === 'undo') done.pop();
          else done.push(seq);
        }
        const st = projection.state;
        for (const side of [0, 1] as const) {
          expect(st.onMat[side]).toBeGreaterThan(0);
          expect(st.onMat[side]).toBeLessThanOrEqual(7);
          expect(st.score[side]).toBe(st.raids.reduce((n, r) => n + r.points[side], 0));
        }
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(st);
      }),
    );
  });
});
