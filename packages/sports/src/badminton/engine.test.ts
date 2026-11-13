import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { badmintonPlayerOfTheMatch } from './awards.js';
import {
  badmintonEngine as engine,
  type BadmintonState,
  currentGame,
  serviceView,
} from './engine.js';
import { participantId, runGoldenLog } from './golden/run.js';
import { badmintonPresets, type BadmintonSettings } from './settings.js';

const official = badmintonPresets.find((p) => p.key === 'bwf-3x21')!.config;
const singles: BadmintonSettings = { ...official, discipline: 'singles' };
const doubles: BadmintonSettings = { ...official, discipline: 'doubles' };
const [a, b, c, d] = [0, 1, 2, 3].map(participantId) as [string, string, string, string];

const roster = (config: BadmintonSettings) =>
  config.discipline === 'singles'
    ? {
        sides: [
          { side: 0 as const, participantIds: [a] },
          { side: 1 as const, participantIds: [c] },
        ],
      }
    : {
        sides: [
          { side: 0 as const, participantIds: [a, b] },
          { side: 1 as const, participantIds: [c, d] },
        ],
      };

const run = (config: BadmintonSettings, script: string[]) =>
  runGoldenLog({
    name: 'test',
    source: 'test',
    config,
    players:
      config.discipline === 'singles' ? { A: ['a'], B: ['c'] } : { A: ['a', 'b'], B: ['c', 'd'] },
    script,
    expected: { games: [], winner: null, summary: '' },
  });

describe('setup', () => {
  it('needs one player a side in singles and two in doubles', () => {
    expect(engine.validateSetup(singles, roster(doubles)).ok).toBe(false);
    expect(engine.validateSetup(doubles, roster(singles)).ok).toBe(false);
    expect(engine.validateSetup(doubles, roster(doubles)).ok).toBe(true);
  });

  it('refuses the same player on both sides', () => {
    const r = {
      sides: [
        { side: 0 as const, participantIds: [a] },
        { side: 1 as const, participantIds: [a] },
      ],
    };
    expect(engine.validateSetup(singles, r).ok).toBe(false);
  });

  it('rejects a cap below the game target', () => {
    expect(engine.settingsSchema.safeParse({ ...singles, cap: 20 }).success).toBe(false);
  });
});

describe('commands', () => {
  const fresh = (config: BadmintonSettings) => engine.init(config, roster(config));

  it('needs a started game before a rally', () => {
    const r = engine.validate(fresh(singles), { type: 'rally', winner: 0 });
    expect(!r.ok && r.error.code).toBe('NO_GAME');
  });

  it('needs the first server and receiver in doubles', () => {
    const s = fresh(doubles);
    expect(engine.validate(s, { type: 'start_game', servingSide: 0 }).ok).toBe(false);
    expect(
      engine.validate(s, { type: 'start_game', servingSide: 0, serverId: c, receiverId: a }).ok,
    ).toBe(false);
    expect(
      engine.validate(s, { type: 'start_game', servingSide: 0, serverId: b, receiverId: d }).ok,
    ).toBe(true);
  });

  it('makes the winner of a game serve first in the next', () => {
    const { state } = run(singles, ['start A', 'B*21']).projection;
    expect(state.phase).toBe('awaiting_service');
    const r = engine.validate(state, { type: 'start_game', servingSide: 0 });
    expect(!r.ok && r.error.code).toBe('WINNER_SERVES_FIRST');
    expect(engine.validate(state, { type: 'start_game', servingSide: 1 }).ok).toBe(true);
  });

  it('serves singles from the court matching the server’s score', () => {
    const { state } = run(singles, ['start A', 'A B A']).projection;
    // 2–1 to A, A serving after winning a rally on B's serve: even score → right court.
    expect(serviceView(state)).toMatchObject({
      servingSide: 0,
      serverId: a,
      receiverId: participantId(1),
      court: 'right',
    });
    const after = run(singles, ['start A', 'A B A A']).projection.state;
    expect(serviceView(after)).toMatchObject({ court: 'left' });
  });

  it('offers no commands once the match is over', () => {
    const { state } = run(singles, ['start A', 'A*21', 'start A', 'A*21']).projection;
    expect(engine.isComplete(state)).toBe(true);
    expect(engine.commands(state)).toEqual([]);
    expect(engine.validate(state, { type: 'concede', side: 0, reason: 'retired' }).ok).toBe(false);
  });
});

describe('facts', () => {
  const factTypes = (config: BadmintonSettings, script: string[]) => {
    const { projection } = run(config, script);
    return projection.timeline.flatMap((t) => t.facts.map((f) => `${t.seq}:${f.type}`));
  };

  it('announces the interval when the leading score first reaches 11', () => {
    const facts = factTypes(singles, ['start A', 'A*11 B*11 A']);
    // seq 1 CREATED, 2 START, 3 start_game; the 11th A rally is seq 14.
    expect(facts.filter((f) => f.endsWith(':interval'))).toEqual(['14:interval']);
  });

  it('changes ends after a game and at 11 in the deciding game', () => {
    const facts = factTypes(singles, ['start A', 'A*21', 'start A', 'B*21', 'start B', 'B*11']);
    expect(facts.filter((f) => f.endsWith(':change_ends'))).toHaveLength(3);
  });
});

describe('result and awards', () => {
  it('names the winner and lets partners share Player of the Match', () => {
    const { state } = run(doubles, ['start B c a', 'B*21', 'start B d b', 'B*21']).projection;
    const result = engine.result(state);
    expect(result).toMatchObject({ status: 'won', winnerSide: 1, summary: '0–21, 0–21' });
    const award = badmintonPlayerOfTheMatch.compute(state, engine.stats(state));
    expect(award?.recipients.map((r) => r.participantId)).toEqual([c, d]);
    expect(award?.metrics).toEqual({ games_won: 2, points_won: 42, longest_streak: 21 });
  });

  it('gives no automatic award for a walkover', () => {
    const { state } = run(singles, ['concede A walkover']).projection;
    expect(engine.result(state)).toMatchObject({ winnerSide: 1, summary: 'Walkover' });
    expect(badmintonPlayerOfTheMatch.compute(state, engine.stats(state))).toBeNull();
  });
});

describe('corrections', () => {
  it('refuses a correction that would end the match before later rallies', () => {
    // One game to 3: A leads 2–0, then B wins 1. Changing B's point to A ends the match early.
    const config: BadmintonSettings = {
      ...singles,
      pointsToWin: 3,
      cap: 3,
      winBy: 1,
      gamesToWin: 1,
      intervalAt: null,
      deciderChangeEndsAt: null,
    };
    const { events, projection } = run(config, ['start A', 'A A B B']);
    const target = projection.timeline.find(
      (t) => t.command?.type === 'rally' && t.command.winner === 1,
    )!;
    const r = append(engine, projection, events, {
      seq: events.length + 1,
      kind: 'REPLACE',
      targetSeq: target.seq,
      occurredAt: 0,
      payload: { type: 'rally', winner: 0 },
    });
    expect(!r.ok && r.error).toMatchObject({
      code: 'CORRECTION_INVALIDATES',
      blockedSeq: target.seq + 1,
    });
  });
});

describe('properties', () => {
  const configArb = fc.record({
    discipline: fc.constantFrom('singles' as const, 'doubles' as const),
    preset: fc.constantFrom(...badmintonPresets),
  });
  type Step =
    | { kind: 'rally'; winner: 0 | 1 }
    | { kind: 'undo' }
    | { kind: 'fix'; back: number }
    | { kind: 'pick'; n: number };
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    {
      weight: 12,
      arbitrary: fc.record({
        kind: fc.constant('rally' as const),
        winner: fc.constantFrom(0 as const, 1 as const),
      }),
    },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('undo' as const) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('fix' as const), back: fc.nat(20) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('pick' as const), n: fc.nat(3) }) },
  );

  function play(config: BadmintonSettings, steps: Step[]) {
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: 'badminton',
          presetKey: 'p',
          presetVersion: 1,
          config,
          roster: roster(config),
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 1, payload: { action: 'START' } },
    ];
    const r = replay(engine, events);
    if (!r.ok) throw new Error(r.error.message);
    let p = r.value;
    const states: BadmintonState[] = [];
    for (const s of steps) {
      const seq = events.length + 1;
      let e: LedgerEvent | null = null;
      const state = p.state;
      if (state.phase === 'complete') break;
      if (state.phase === 'awaiting_service') {
        const side = state.nextServingSide ?? (s.kind === 'pick' ? ((s.n % 2) as 0 | 1) : 0);
        const n = s.kind === 'pick' ? s.n : 0;
        const players = state.players;
        e = {
          seq,
          occurredAt: seq,
          kind: 'COMMAND',
          payload: {
            type: 'start_game',
            servingSide: side,
            serverId: players[side][n % players[side].length],
            receiverId: players[1 - side]![(n >> 1) % players[1 - side]!.length],
          },
        };
      } else if (s.kind === 'rally') {
        e = { seq, occurredAt: seq, kind: 'COMMAND', payload: { type: 'rally', winner: s.winner } };
      } else if (s.kind === 'undo') {
        const last = [...p.timeline].reverse().find((t) => !t.voidedBy && t.kind === 'COMMAND');
        if (last) e = { seq, occurredAt: seq, kind: 'VOID', targetSeq: last.seq, payload: {} };
      } else if (s.kind === 'fix') {
        const rallies = p.timeline.filter((t) => !t.voidedBy && t.command?.type === 'rally');
        const t = rallies[rallies.length - 1 - (s.back % Math.max(rallies.length, 1))];
        if (t?.command?.type === 'rally') {
          e = {
            seq,
            occurredAt: seq,
            kind: 'REPLACE',
            targetSeq: t.seq,
            payload: { type: 'rally', winner: t.command.winner === 0 ? 1 : 0 },
          };
        }
      }
      if (!e) continue;
      const next = append(engine, p, events, e);
      if (next.ok) {
        events.push(e);
        p = next.value;
        states.push(p.state);
      }
    }
    return { events, p, states };
  }

  function checkInvariants(state: BadmintonState) {
    const { config } = state;
    for (const [i, g] of state.games.entries()) {
      for (const pts of g.points) {
        expect(pts).toBeGreaterThanOrEqual(0);
        if (config.cap !== null) expect(pts).toBeLessThanOrEqual(config.cap);
      }
      const finished = g.winner !== null;
      const isLast = i === state.games.length - 1;
      if (!isLast || state.phase === 'complete') {
        if (!finished) expect(state.outcome?.method).not.toBe('played');
      }
      if (finished) {
        const w = g.points[g.winner!];
        const l = g.points[1 - g.winner!]!;
        // Won exactly when the rule was first met: at the target with the lead, or at the cap.
        expect((w >= config.pointsToWin && w - l >= config.winBy) || w === config.cap).toBe(true);
        expect(w - 1 >= config.pointsToWin && w - 1 - l >= config.winBy).toBe(false);
      }
    }
    const won = [0, 1].map((side) => state.games.filter((g) => g.winner === side).length);
    expect(Math.max(...won)).toBeLessThanOrEqual(config.gamesToWin);
    expect(state.phase === 'complete').toBe(state.outcome !== null);
    if (state.outcome?.method === 'played')
      expect(won[state.outcome.winner]).toBe(config.gamesToWin);
    const view = serviceView(state);
    if (view) {
      expect(state.players[view.servingSide]).toContain(view.serverId);
      expect(state.players[1 - view.servingSide]).toContain(view.receiverId);
      const even = currentGame(state).points[view.servingSide] % 2 === 0;
      expect(view.court).toBe(even ? 'right' : 'left');
      if (config.discipline === 'doubles') {
        expect(state.rightCourt![view.servingSide] === view.serverId).toBe(even);
      }
    }
  }

  it('keeps scores, games and service legal through any rallies, undos and fixes', () => {
    fc.assert(
      fc.property(
        configArb,
        fc.array(stepArb, { maxLength: 300 }),
        ({ discipline, preset }, steps) => {
          const { states } = play({ ...preset.config, discipline }, steps);
          states.forEach(checkInvariants);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('replays to the state reached by incremental appends', () => {
    fc.assert(
      fc.property(
        configArb,
        fc.array(stepArb, { maxLength: 200 }),
        ({ discipline, preset }, steps) => {
          const { events, p } = play({ ...preset.config, discipline }, steps);
          const r = replay(engine, events);
          expect(r.ok && r.value.state).toEqual(p.state);
        },
      ),
      { numRuns: 100 },
    );
  });
});
