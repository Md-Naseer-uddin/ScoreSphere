import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  volleyballEngine as engine,
  volleyballServer,
  volleyballSetsWon,
  type VolleyballState,
} from './engine.js';
import { runVolleyballGoldenLog, volleyballParticipantId } from './golden/run.js';
import { volleyballPresets, type VolleyballSettings } from './settings.js';

const small: VolleyballSettings = {
  setsToWin: 2,
  pointsPerSet: 5,
  decidingSetPoints: 3,
  winBy: 2,
  cap: null,
  playersOnCourt: 3,
  substitutionsPerSet: 1,
  timeoutsPerSet: 1,
  deciderChangeEndsAt: 2,
};
const play = (script: string[], config = small) =>
  runVolleyballGoldenLog({
    name: 'test',
    source: 'test',
    config,
    players: { A: ['a1', 'a2', 'a3', 'a4', 'a5'], B: ['b1', 'b2', 'b3', 'b4'] },
    script,
    expected: { summary: '', winner: null },
  });
const opening = 'set A a1 a2 a3 | b1 b2 b3';

describe('rules', () => {
  it('makes the team that received first serve first in the next set', () => {
    const run = play([opening, 'A*5']);
    const r = engine.validate(run.projection.state, {
      type: 'start_set',
      servingSide: 0,
      lineups: [
        [run.ids.a1!, run.ids.a2!, run.ids.a3!],
        [run.ids.b1!, run.ids.b2!, run.ids.b3!],
      ],
    });
    expect(!r.ok && r.error.code).toBe('SERVE_ORDER');
  });

  it('needs full line-ups of the team’s own players', () => {
    const run = play([]);
    const r = engine.validate(run.projection.state, {
      type: 'start_set',
      servingSide: 0,
      lineups: [
        [run.ids.a1!, run.ids.a2!, run.ids.b1!],
        [run.ids.b1!, run.ids.b2!, run.ids.b3!],
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('limits substitutions and timeouts per set, and resets them each set', () => {
    const run = play([opening, 'sub A a3 a4', 'timeout B']);
    const { state } = run.projection;
    expect(
      engine.validate(state, { type: 'substitute', side: 0, outId: run.ids.a4!, inId: run.ids.a5! })
        .ok,
    ).toBe(false);
    expect(engine.validate(state, { type: 'timeout', side: 1 }).ok).toBe(false);
    expect(state.lineups![0]).toEqual([run.ids.a1, run.ids.a2, run.ids.a4]);
    const next = play([opening, 'sub A a3 a4', 'A*5', 'set B a1 a2 a3 | b1 b2 b3']);
    expect(next.projection.state.substitutionsUsed).toEqual([0, 0]);
  });

  it('credits an ace only to the server', () => {
    const run = play([opening]);
    const r = engine.validate(run.projection.state, {
      type: 'rally',
      winner: 0,
      credit: { playerId: run.ids.a2!, kind: 'ace' },
    });
    expect(r.ok).toBe(false);
  });

  it('prompts a change of ends in the deciding set', () => {
    const run = play([opening, 'A*5', 'set B a1 a2 a3 | b1 b2 b3', 'B*5', opening, 'A A']);
    const facts = run.projection.timeline.flatMap((t) => t.facts);
    expect(facts.filter((f) => f.type === 'change_ends')).toHaveLength(1);
  });
});

describe('properties', () => {
  type Step = 0 | 1 | 'sub' | 'undo';
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    { weight: 12, arbitrary: fc.constantFrom<0 | 1>(0, 1) },
    { weight: 1, arbitrary: fc.constant<'sub'>('sub') },
    { weight: 1, arbitrary: fc.constant<'undo'>('undo') },
  );

  function simulate(config: VolleyballSettings, steps: Step[]) {
    const n = config.playersOnCourt;
    const squads = [0, 1].map((side) =>
      Array.from({ length: n + 2 }, (_, i) => volleyballParticipantId(side * 20 + i)),
    ) as [string[], string[]];
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: 'volleyball',
          presetKey: 'p',
          presetVersion: 1,
          config,
          roster: {
            sides: [
              { side: 0, participantIds: squads[0] },
              { side: 1, participantIds: squads[1] },
            ],
          },
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
    ];
    const r = replay(engine, events);
    if (!r.ok) throw new Error(r.error.message);
    let p = r.value;
    const states: VolleyballState[] = [];
    const tryAppend = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>) => {
      const event = { ...e, seq: events.length + 1, occurredAt: events.length } as LedgerEvent;
      const next = append(engine, p, events, event);
      if (next.ok) {
        p = next.value;
        events.push(event);
        states.push(p.state);
      }
    };
    for (const step of steps) {
      const s = p.state;
      if (s.phase === 'complete') break;
      if (s.phase === 'awaiting_set') {
        const last = s.sets[s.sets.length - 1];
        const servingSide = last ? (last.firstServer === 0 ? 1 : 0) : 0;
        tryAppend({
          kind: 'COMMAND',
          payload: {
            type: 'start_set',
            servingSide,
            lineups: [squads[0].slice(0, n), squads[1].slice(0, n)],
          },
        });
        continue;
      }
      if (step === 'undo') {
        const last = [...p.timeline].reverse().find((t) => !t.voidedBy && t.kind === 'COMMAND');
        if (last) tryAppend({ kind: 'VOID', targetSeq: last.seq, payload: {} });
      } else if (step === 'sub') {
        const court = s.lineups![0];
        const bench = squads[0].find((id) => !court.includes(id))!;
        tryAppend({
          kind: 'COMMAND',
          payload: { type: 'substitute', side: 0, outId: court[court.length - 1], inId: bench },
        });
      } else {
        tryAppend({ kind: 'COMMAND', payload: { type: 'rally', winner: step } });
      }
    }
    return { events, p, states };
  }

  function checkInvariants(state: VolleyballState) {
    const { config } = state;
    expect(Math.max(...volleyballSetsWon(state))).toBeLessThanOrEqual(config.setsToWin);
    for (const set of state.sets) {
      if (set.winner === null) continue;
      const w = set.points[set.winner];
      const l = set.points[1 - set.winner]!;
      expect(w - l >= config.winBy || w === config.cap).toBe(true);
      expect(
        w - 1 - l >= config.winBy &&
          w - 1 >= config.decidingSetPoints &&
          w - 1 >= config.pointsPerSet,
      ).toBe(false);
    }
    if (state.lineups) {
      for (const lineup of state.lineups) {
        expect(lineup).toHaveLength(config.playersOnCourt);
        expect(new Set(lineup).size).toBe(config.playersOnCourt);
      }
    }
    const srv = volleyballServer(state);
    if (srv) expect(state.lineups![state.serving!]![0]).toBe(srv);
  }

  const configArb = fc.constantFrom(...volleyballPresets.map((p) => p.config), small);

  it('keeps sets, line-ups and service legal through any rallies, substitutions and undos', () => {
    fc.assert(
      fc.property(configArb, fc.array(stepArb, { maxLength: 400 }), (config, steps) => {
        simulate(config, steps).states.forEach(checkInvariants);
      }),
      { numRuns: 80 },
    );
  });

  it('replays to the state reached by incremental appends', () => {
    fc.assert(
      fc.property(configArb, fc.array(stepArb, { maxLength: 300 }), (config, steps) => {
        const { events, p } = simulate(config, steps);
        const r = replay(engine, events);
        expect(r.ok && r.value.state).toEqual(p.state);
      }),
      { numRuns: 60 },
    );
  });
});
