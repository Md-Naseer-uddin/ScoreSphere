import { newId } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  batchView,
  type KhoKhoCommand,
  khoKhoEngine as engine,
  type KhoKhoState,
} from './engine.js';
import { khoKhoPresets } from './settings.js';

const config = khoKhoPresets[0]!.config;
const A = [newId(), newId()];
const B = [newId(), newId()];

function ledger(steps: KhoKhoCommand[]): LedgerEvent[] {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'kho-kho',
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
    events.push({ seq, kind: 'COMMAND', occurredAt: seq * 10_000, payload });
  }
  return events;
}

function play(steps: KhoKhoCommand[]): KhoKhoState {
  const r = replay(engine, ledger(steps));
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

const start: KhoKhoCommand = { type: 'start_turn', chasing: 1 };
const next: KhoKhoCommand = { type: 'start_turn' };
const end: KhoKhoCommand = { type: 'end_turn' };
const out: KhoKhoCommand = { type: 'out', kind: 'touch' };

describe('kho-kho engine', () => {
  it('alternates the chasing team, starting with the toss', () => {
    expect([
      play([start]).chasing,
      play([start, end, next]).chasing,
      play([start, end, next, end, next]).chasing,
    ]).toEqual([1, 0, 1]);
    expect(engine.validate(play([start, end]), { type: 'start_turn', chasing: 1 }).ok).toBe(false);
  });

  it('credits chasers only from the chasing team, for touches and pole dives', () => {
    const state = play([start]);
    expect(engine.validate(state, { type: 'out', kind: 'touch', chaserId: B[0]! }).ok).toBe(true);
    expect(engine.validate(state, { type: 'out', kind: 'touch', chaserId: A[0]! }).ok).toBe(false);
    expect(engine.validate(state, { type: 'out', kind: 'touch', defenderId: B[0]! }).ok).toBe(
      false,
    );
    expect(engine.validate(state, { type: 'out', kind: 'late_entry', chaserId: B[0]! }).ok).toBe(
      false,
    );
  });

  it('follows the batches of defenders through the turn', () => {
    expect(batchView(play([start, out, out, out, out]))).toEqual({
      outs: 4,
      batch: 2,
      outInBatch: 1,
    });
    expect(batchView(play([start, out, end, next]))).toEqual({ outs: 0, batch: 1, outInBatch: 0 });
  });

  it('keeps the score equal to the outs and technical points', () => {
    const step = fc.oneof(
      fc.constant({ type: 'out' as const }),
      fc.record({ type: fc.constant('tech' as const), side: fc.constantFrom<0 | 1>(0, 1) }),
      fc.constant({ type: 'turn' as const }),
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
          const occurredAt = seq * 10_000;
          const payload: KhoKhoCommand =
            s.type === 'out'
              ? out
              : s.type === 'tech'
                ? { type: 'technical', side: s.side, points: 1 }
                : projection.state.phase === 'playing'
                  ? end
                  : next;
          const event: LedgerEvent =
            s.type === 'undo'
              ? { seq, kind: 'VOID', occurredAt, targetSeq: done.at(-1) ?? 0, payload: {} }
              : { seq, kind: 'COMMAND', occurredAt, payload };
          const result = append(engine, projection, events, event);
          if (!result.ok) continue;
          events.push(event);
          projection = result.value;
          if (s.type === 'undo') done.pop();
          else done.push(seq);
        }
        const st = projection.state;
        for (const side of [0, 1] as const) {
          const outs = st.outs.filter((o) => o.chasing === side).length;
          const tech = st.technicals
            .filter((t) => t.side === side)
            .reduce((n, t) => n + t.points, 0);
          expect(st.score[side]).toBe(outs + tech);
        }
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(st);
      }),
    );
  });
});
