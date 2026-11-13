import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chessClocksAt, chessEngine as engine } from './engine.js';
import { chessParticipantId, runChessGoldenLog } from './golden/run.js';
import type { ChessSettings } from './settings.js';

const blitz: ChessSettings = {
  timeControl: { baseMs: 180_000, incrementMs: 2_000, delayMs: 0, stages: [] },
};
const play = (script: string[], config: ChessSettings = blitz) =>
  runChessGoldenLog({
    name: 'test',
    source: 'test',
    config,
    script,
    expected: { summary: '', winner: null },
  });

describe('clock rules', () => {
  it('only lets the player to move press the clock', () => {
    const { state } = play(['start A']).projection;
    const r = engine.validate(
      state,
      { type: 'press', side: 1 },
      { occurredAt: state.turnStartedAt! + 1000 },
    );
    expect(!r.ok && r.error.code).toBe('NOT_YOUR_TURN');
  });

  it('refuses a press after the flag fell, and a flag while time is left', () => {
    const { state } = play(['start A']).projection;
    const late = { occurredAt: state.turnStartedAt! + 181_000 };
    expect(engine.validate(state, { type: 'press', side: 0 }, late).ok).toBe(false);
    expect(engine.validate(state, { type: 'flag', side: 0, result: 'loss' }, late).ok).toBe(true);
    const early = { occurredAt: state.turnStartedAt! + 1_000 };
    expect(engine.validate(state, { type: 'flag', side: 0, result: 'loss' }, early).ok).toBe(false);
  });

  it('needs a winner for decisive results and none for draws', () => {
    const { state } = play(['start A']).projection;
    expect(engine.validate(state, { type: 'result', ending: 'checkmate' }).ok).toBe(false);
    expect(engine.validate(state, { type: 'result', ending: 'stalemate', winner: 0 }).ok).toBe(
      false,
    );
  });

  it('shows the running clock counting down, with the delay free', () => {
    const delayed: ChessSettings = {
      timeControl: { baseMs: 60_000, incrementMs: 0, delayMs: 5_000, stages: [] },
    };
    const { state } = play(['start A'], delayed).projection;
    const t0 = state.turnStartedAt!;
    expect(chessClocksAt(state, t0 + 4_000)).toEqual([60_000, 60_000]);
    expect(chessClocksAt(state, t0 + 15_000)).toEqual([50_000, 60_000]);
  });

  it('records results without a clock', () => {
    const run = play(['start A', 'result checkmate B 30'], { timeControl: null });
    expect(engine.result(run.projection.state).summary).toBe('0–1 (checkmate)');
    expect(engine.validate(run.projection.state, { type: 'press', side: 0 }).ok).toBe(false);
  });

  it('keeps the remaining time through a reload: the clock is rebuilt from the ledger', () => {
    const run = play(['start A', 'press A 12', 'press B 8']);
    const replayed = replay(engine, run.events);
    expect(replayed.ok && replayed.value.state.clocks).toEqual(run.projection.state.clocks);
    const now = run.projection.state.turnStartedAt! + 30_000;
    expect(chessClocksAt(run.projection.state, now)).toEqual([
      180_000 - 12_000 + 2_000 - 30_000,
      180_000 - 8_000 + 2_000,
    ]);
  });
});

describe('properties', () => {
  type Step = { kind: 'press'; ms: number } | { kind: 'pause'; ms: number; resumeAfter: number };
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    {
      weight: 8,
      arbitrary: fc.record({
        kind: fc.constant('press' as const),
        ms: fc.integer({ min: 0, max: 20_000 }),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('pause' as const),
        ms: fc.integer({ min: 0, max: 5_000 }),
        resumeAfter: fc.integer({ min: 0, max: 600_000 }),
      }),
    },
  );
  const tcArb = fc.record({
    baseMs: fc.integer({ min: 60_000, max: 600_000 }),
    incrementMs: fc.integer({ min: 0, max: 10_000 }),
    delayMs: fc.integer({ min: 0, max: 5_000 }),
    stages: fc.array(
      fc.record({
        afterMoves: fc.integer({ min: 1, max: 6 }),
        addMs: fc.integer({ min: 0, max: 60_000 }),
      }),
      { maxLength: 2 },
    ),
  });

  it('remaining time is base + increments + stage time − charged time, through presses and pauses', () => {
    fc.assert(
      fc.property(tcArb, fc.array(stepArb, { maxLength: 40 }), (tc, steps) => {
        const config: ChessSettings = { timeControl: tc };
        let t = 1_700_000_000_000;
        const events: LedgerEvent[] = [
          {
            seq: 1,
            kind: 'CREATED',
            occurredAt: t,
            payload: {
              sport: 'chess',
              presetKey: 'p',
              presetVersion: 1,
              config,
              roster: {
                sides: [
                  { side: 0, participantIds: [chessParticipantId(0)] },
                  { side: 1, participantIds: [chessParticipantId(1)] },
                ],
              },
            },
          },
          { seq: 2, kind: 'LIFECYCLE', occurredAt: t, payload: { action: 'START' } },
          {
            seq: 3,
            kind: 'COMMAND',
            occurredAt: t,
            payload: { type: 'start_clock', whiteSide: 0 },
          },
        ];
        const r = replay(engine, events);
        if (!r.ok) throw new Error(r.error.message);
        let p = r.value;
        const charged: [number, number] = [0, 0];
        const usedThisMove: [number, number] = [0, 0];
        const push = (e: Omit<LedgerEvent, 'seq'>) => {
          const event = { ...e, seq: events.length + 1 } as LedgerEvent;
          const next = append(engine, p, events, event);
          if (next.ok) {
            p = next.value;
            events.push(event);
          }
          return next.ok;
        };
        for (const step of steps) {
          const side = p.state.toMove!;
          if (step.kind === 'pause') {
            t += step.ms;
            if (push({ kind: 'LIFECYCLE', occurredAt: t, payload: { action: 'PAUSE' } })) {
              usedThisMove[side] = usedThisMove[side] + step.ms;
              t += step.resumeAfter;
              push({ kind: 'LIFECYCLE', occurredAt: t, payload: { action: 'RESUME' } });
            }
            continue;
          }
          t += step.ms;
          if (push({ kind: 'COMMAND', occurredAt: t, payload: { type: 'press', side } })) {
            charged[side] = charged[side] + Math.max(0, usedThisMove[side] + step.ms - tc.delayMs);
            usedThisMove[side] = 0;
          } else {
            // The flag fell before this press; the move's time so far still counts.
            t -= step.ms;
          }
        }
        for (const side of [0, 1] as const) {
          const moves = p.state.clocks[side].moves;
          const stages = tc.stages
            .filter((s) => s.afterMoves <= moves)
            .reduce((sum, s) => sum + s.addMs, 0);
          expect(p.state.clocks[side].remainingMs).toBe(
            tc.baseMs + tc.incrementMs * moves + stages - charged[side]!,
          );
        }
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(p.state);
      }),
      { numRuns: 150 },
    );
  });
});
