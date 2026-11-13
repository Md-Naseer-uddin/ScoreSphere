import { newId } from '@scoresphere/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SportEngine } from './engine.js';
import { append, type LedgerEvent, playingTimeAt, replay, undoTarget } from './ledger.js';
import { err, ok } from './result.js';

/**
 * A toy engine: first to `target` points. `double` doubles a side's score and is only
 * valid once that side has scored, so corrections can invalidate later events.
 */
const configSchema = z.object({ target: z.int().min(1) });
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), side: z.union([z.literal(0), z.literal(1)]) }),
  z.object({ type: z.literal('double'), side: z.union([z.literal(0), z.literal(1)]) }),
]);
type Config = z.infer<typeof configSchema>;
type Command = z.infer<typeof commandSchema>;
interface State {
  target: number;
  score: [number, number];
}

const tally: SportEngine<State, Config, Command> = {
  sport: 'badminton',
  version: 1,
  settingsSchema: configSchema,
  commandSchema,
  presets: [],
  init: (config) => ({ target: config.target, score: [0, 0] }),
  commands: () => [],
  validate: (state, cmd) =>
    cmd.type === 'double' && state.score[cmd.side] === 0
      ? err({ code: 'NOTHING_TO_DOUBLE', message: 'Nothing to double.' })
      : ok(undefined),
  apply: (state, cmd) => {
    const score: [number, number] = [...state.score];
    score[cmd.side] = cmd.type === 'point' ? score[cmd.side] + 1 : score[cmd.side] * 2;
    return { state: { ...state, score }, facts: [{ type: cmd.type, data: { side: cmd.side } }] };
  },
  isComplete: (state) => state.score.some((s) => s >= state.target),
  result: (state) => ({ status: 'in_progress', summary: state.score.join('-') }),
  stats: () => [],
};

const created = (target = 5): LedgerEvent => ({
  seq: 1,
  kind: 'CREATED',
  occurredAt: 1000,
  payload: {
    sport: 'badminton',
    presetKey: 'test',
    presetVersion: 1,
    config: { target },
    roster: {
      sides: [
        { side: 0, participantIds: [newId()] },
        { side: 1, participantIds: [newId()] },
      ],
    },
  },
});

/** Builds a ledger from short specs: 'S' start, 'P' pause, 'R' resume, 'A' abandon, 0/1 point. */
function ledger(steps: (string | number | LedgerEvent)[], target = 5): LedgerEvent[] {
  const events: LedgerEvent[] = [created(target)];
  const actions: Record<string, string> = { S: 'START', P: 'PAUSE', R: 'RESUME', A: 'ABANDON' };
  for (const s of steps) {
    const seq = events.length + 1;
    const occurredAt = 1000 + seq * 1000;
    if (typeof s === 'object') events.push({ ...s, seq, occurredAt });
    else if (typeof s === 'number')
      events.push({ seq, occurredAt, kind: 'COMMAND', payload: { type: 'point', side: s } });
    else events.push({ seq, occurredAt, kind: 'LIFECYCLE', payload: { action: actions[s] } });
  }
  return events;
}

const voidOf = (targetSeq: number) => ({ kind: 'VOID', targetSeq, payload: {} }) as LedgerEvent;
const replaceOf = (targetSeq: number, payload: Command) =>
  ({ kind: 'REPLACE', targetSeq, payload }) as LedgerEvent;

function fold(events: LedgerEvent[]) {
  const r = replay(tally, events);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

describe('replay', () => {
  it('requires CREATED as event 1', () => {
    const r = replay(tally, [
      { seq: 1, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
    ]);
    expect(!r.ok && r.error.code).toBe('NOT_CREATED');
    expect(replay(tally, []).ok).toBe(false);
  });

  it('refuses gaps in seq', () => {
    const events = ledger(['S', 0, 0]);
    events.splice(2, 1);
    const r = replay(tally, events);
    expect(!r.ok && r.error).toMatchObject({ code: 'SEQ_ORDER', seq: 4 });
  });

  it('refuses settings the engine rejects', () => {
    const r = replay(tally, ledger([], 0));
    expect(!r.ok && r.error.code).toBe('BAD_PAYLOAD');
  });

  it('refuses scoring before the match starts', () => {
    const r = replay(tally, ledger([0]));
    expect(!r.ok && r.error).toMatchObject({ code: 'NOT_LIVE', seq: 2 });
  });

  it('completes when the engine says so and refuses later scoring', () => {
    const p = fold(ledger(['S', 0, 0, 0], 3));
    expect(p.status).toBe('completed');
    expect(p.endedAt).toBe(6000);
    const r = replay(tally, ledger(['S', 0, 0, 0, 1], 3));
    expect(!r.ok && r.error).toMatchObject({ code: 'NOT_LIVE', seq: 6 });
  });

  it('reopens a completed match when the winning point is undone', () => {
    const p = fold(ledger(['S', 0, 0, 0, voidOf(5)], 3));
    expect(p.status).toBe('live');
    expect(p.state.score).toEqual([2, 0]);
    expect(p.endedAt).toBeNull();
    expect(p.timeline.find((t) => t.seq === 5)?.voidedBy).toBe(6);
  });

  it('applies a replacement in place of the original command', () => {
    const p = fold(ledger(['S', 0, 0, replaceOf(3, { type: 'point', side: 1 })]));
    expect(p.state.score).toEqual([1, 1]);
    const entry = p.timeline.find((t) => t.seq === 3)!;
    expect(entry.command).toEqual({ type: 'point', side: 1 });
    expect(entry.original).toEqual({ type: 'point', side: 0 });
    expect(entry.replacedBy).toBe(5);
  });

  it('refuses to undo the same event twice or to undo CREATED', () => {
    let r = replay(tally, ledger(['S', 0, voidOf(3), voidOf(3)]));
    expect(!r.ok && r.error).toMatchObject({ code: 'BAD_TARGET', seq: 5 });
    r = replay(tally, ledger(['S', voidOf(1)]));
    expect(!r.ok && r.error.code).toBe('BAD_TARGET');
  });

  it('refuses to correct a lifecycle event', () => {
    const r = replay(tally, ledger(['S', replaceOf(2, { type: 'point', side: 0 })]));
    expect(!r.ok && r.error.code).toBe('BAD_TARGET');
  });

  it('measures playing time across a pause', () => {
    const events = ledger(['S', 0, 'P', 'R', 0, 0], 3);
    // seq: 2 START@3000, 3 point@4000, 4 PAUSE@5000, 5 RESUME@6000, 6 point@7000, 7 point@8000
    const p = fold(events);
    expect(p.status).toBe('completed');
    expect(p.playingMs).toBe(2000 + 2000);
    expect(playingTimeAt(p, 99_000)).toBe(4000);
    const live = fold(events.slice(0, 5));
    expect(live.liveSince).toBe(6000);
    expect(playingTimeAt(live, 6500)).toBe(2500);
  });

  it('can undo START back to a scheduled match', () => {
    const p = fold(ledger(['S', voidOf(2)]));
    expect(p.status).toBe('scheduled');
    expect(p.startedAt).toBeNull();
  });

  it('skips and reports invalid events in lenient mode', () => {
    const events = ledger([
      'S',
      { kind: 'COMMAND', payload: { type: 'double', side: 1 } } as LedgerEvent,
      0,
    ]);
    expect(replay(tally, events).ok).toBe(false);
    const r = replay(tally, events, { lenient: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.score).toEqual([1, 0]);
    expect(r.value.invalid).toHaveLength(1);
    expect(r.value.invalid[0]).toMatchObject({
      code: 'ENGINE_REJECTED',
      seq: 3,
      engineCode: 'NOTHING_TO_DOUBLE',
    });
  });
});

describe('append', () => {
  it('extends the projection for scoring events', () => {
    const events = ledger(['S', 0]);
    const p = fold(events);
    const next = append(tally, p, events, {
      seq: 4,
      kind: 'COMMAND',
      occurredAt: 9000,
      payload: { type: 'point', side: 1 },
    });
    expect(next.ok && next.value.state.score).toEqual([1, 1]);
    expect(p.state.score).toEqual([1, 0]);
    expect(p.timeline).toHaveLength(2);
  });

  it('refuses an event out of sequence', () => {
    const events = ledger(['S']);
    const r = append(tally, fold(events), events, {
      seq: 5,
      kind: 'COMMAND',
      occurredAt: 1,
      payload: { type: 'point', side: 0 },
    });
    expect(!r.ok && r.error.code).toBe('SEQ_ORDER');
  });

  it('refuses a correction that would break a later event', () => {
    const events = ledger([
      'S',
      0,
      { kind: 'COMMAND', payload: { type: 'double', side: 0 } } as LedgerEvent,
    ]);
    const p = fold(events);
    const r = append(tally, p, events, {
      seq: 5,
      kind: 'REPLACE',
      targetSeq: 3,
      occurredAt: 9000,
      payload: { type: 'point', side: 1 },
    });
    expect(!r.ok && r.error).toMatchObject({
      code: 'CORRECTION_INVALIDATES',
      seq: 5,
      blockedSeq: 4,
    });
  });

  it('points Undo at the latest live event', () => {
    const p = fold(ledger(['S', 0, 1, voidOf(4)]));
    expect(undoTarget(p.timeline)).toBe(3);
  });
});

describe('properties', () => {
  const stepArb = fc.oneof(
    fc.constantFrom<string | number>(0, 1, 'P', 'R'),
    fc.record({ undo: fc.constant(true) }),
  );

  /** Builds a valid ledger by appending only what the ledger accepts. */
  function build(steps: (string | number | { undo: true })[]) {
    let events = ledger(['S'], 50);
    let p = fold(events);
    for (const s of steps) {
      const seq = events.length + 1;
      const occurredAt = 1000 + seq * 1000;
      let e: LedgerEvent;
      if (typeof s === 'object') {
        const target = undoTarget(p.timeline);
        if (target === null) continue;
        e = { seq, occurredAt, kind: 'VOID', targetSeq: target, payload: {} };
      } else if (typeof s === 'number') {
        e = { seq, occurredAt, kind: 'COMMAND', payload: { type: 'point', side: s } };
      } else {
        e = {
          seq,
          occurredAt,
          kind: 'LIFECYCLE',
          payload: { action: s === 'P' ? 'PAUSE' : 'RESUME' },
        };
      }
      const r = append(tally, p, events, e);
      if (r.ok) {
        p = r.value;
        events = [...events, e];
      }
    }
    return { events, p };
  }

  it('incremental appends equal a full replay', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), (steps) => {
        const { events, p } = build(steps);
        const replayed = fold(events);
        expect(replayed.state).toEqual(p.state);
        expect(replayed.status).toEqual(p.status);
        expect(replayed.playingMs).toEqual(p.playingMs);
        expect(replayed.timeline.map((t) => [t.seq, t.voidedBy])).toEqual(
          p.timeline.map((t) => [t.seq, t.voidedBy]),
        );
      }),
    );
  });

  it('undo then re-issuing the same command restores the state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(0, 1), { maxLength: 30 }),
        fc.constantFrom(0, 1),
        (points, last) => {
          const { events, p } = build([...points, last]);
          if (p.status !== 'live') return;
          const lastSeq = undoTarget(p.timeline)!;
          const undone = append(tally, p, events, {
            seq: events.length + 1,
            kind: 'VOID',
            targetSeq: lastSeq,
            occurredAt: 1,
            payload: {},
          });
          expect(undone.ok).toBe(true);
          if (!undone.ok) return;
          const voidEvent: LedgerEvent = {
            seq: events.length + 1,
            kind: 'VOID',
            targetSeq: lastSeq,
            occurredAt: 1,
            payload: {},
          };
          const redo = append(tally, undone.value, [...events, voidEvent], {
            seq: events.length + 2,
            kind: 'COMMAND',
            occurredAt: 2,
            payload: events.find((e) => e.seq === lastSeq)!.payload,
          });
          expect(redo.ok && redo.value.state).toEqual(p.state);
        },
      ),
    );
  });
});
