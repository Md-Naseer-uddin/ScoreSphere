import type { Rule } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay, validateRules } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  availableBatters,
  type CricketCommand,
  cricketEngine as engine,
  type CricketState,
  currentInnings,
} from './engine.js';
import { cricketParticipantId, runCricketGoldenLog } from './golden/run.js';
import { cricketRuleCatalogue } from './rules.js';
import { cricketPresets, type CricketSettings } from './settings.js';

const t20 = cricketPresets.find((p) => p.key === 't20')!.config;
const small: CricketSettings = {
  ...t20,
  playersPerSide: 4,
  oversPerInnings: 3,
  maxOversPerBowler: null,
};
const A = ['a1', 'a2', 'a3', 'a4'];
const B = ['b1', 'b2', 'b3', 'b4'];

const play = (script: string[], config: CricketSettings = small) =>
  runCricketGoldenLog({
    name: 'test',
    source: 'test',
    config,
    players: { A, B },
    script,
    expected: { innings: [], summary: '', winner: null },
  });

/** Plays `script`, then checks whether `cmd` would be accepted next. */
function check(
  script: string[],
  cmd: (ids: Record<string, string>) => CricketCommand,
  config = small,
) {
  const run = play(script, config);
  return engine.validate(run.projection.state, cmd(run.ids));
}

const delivery = (extra: Partial<Extract<CricketCommand, { type: 'delivery' }>> = {}) =>
  ({ type: 'delivery', kind: 'bat', runs: 0, boundary: false, ...extra }) as CricketCommand;

describe('setup and order of play', () => {
  it('needs 2 to playersPerSide players a side, each listed once', () => {
    const roster = (a: string[], b: string[]) => ({
      sides: [
        { side: 0 as const, participantIds: a },
        { side: 1 as const, participantIds: b },
      ],
    });
    const ids = [0, 1, 2, 3, 4, 5].map(cricketParticipantId);
    expect(engine.validateSetup(small, roster([ids[0]!], [ids[1]!, ids[2]!])).ok).toBe(false);
    expect(engine.validateSetup(small, roster(ids.slice(0, 5), ids.slice(5))).ok).toBe(false);
    expect(engine.validateSetup(small, roster([ids[0]!, ids[1]!], [ids[1]!, ids[2]!])).ok).toBe(
      false,
    );
    expect(engine.validateSetup(small, roster([ids[0]!, ids[1]!], [ids[2]!, ids[3]!])).ok).toBe(
      true,
    );
  });

  it('takes the batting side from the toss', () => {
    const r = check(['toss B bowl'], (ids) => ({
      type: 'start_innings',
      battingSide: 1,
      strikerId: ids.b1!,
      nonStrikerId: ids.b2!,
    }));
    expect(!r.ok && r.error.code).toBe('WRONG_BATTING_SIDE');
    const run = play(['toss B bowl', 'innings a1 a2']);
    expect(currentInnings(run.projection.state)?.battingSide).toBe(0);
  });

  it('needs a bowler before the first ball and a batter after a wicket', () => {
    expect(check(['innings A a1 a2'], () => delivery()).ok).toBe(false);
    const r = check(['innings A a1 a2', 'bowler b1', 'W'], () => delivery());
    expect(!r.ok && r.error.message).toBe('Choose the next batter first.');
  });
});

describe('bowling restrictions', () => {
  const firstOver = ['innings A a1 a2', 'bowler b1', '0 0 0 0 0 0'];

  it('refuses two overs in a row unless the format allows it', () => {
    const r = check(firstOver, (ids) => ({ type: 'set_bowler', bowlerId: ids.b1! }));
    expect(!r.ok && r.error.code).toBe('CONSECUTIVE_OVERS');
    const gully = { ...small, allowConsecutiveOvers: true };
    expect(check(firstOver, (ids) => ({ type: 'set_bowler', bowlerId: ids.b1! }), gully).ok).toBe(
      true,
    );
  });

  it('enforces the per-bowler over limit', () => {
    const limited = { ...small, maxOversPerBowler: 1 };
    const r = check(
      [...firstOver, 'bowler b2', '0 0 0 0 0 0'],
      (ids) => ({ type: 'set_bowler', bowlerId: ids.b1! }),
      limited,
    );
    expect(!r.ok && r.error.code).toBe('BOWLER_LIMIT');
  });

  it('lets another bowler finish an over, which then is not a maiden', () => {
    const run = play([
      'innings A a1 a2',
      'bowler b1',
      '0 0 0',
      'bowler b2',
      '0 0 0',
      'bowler b3',
      '0',
    ]);
    const inn = currentInnings(run.projection.state)!;
    expect(inn.overs[0]).toMatchObject({ split: true, legalBalls: 6 });
    expect(inn.bowlers[run.ids.b1!]).toMatchObject({ legalBalls: 3, maidens: 0 });
    expect(inn.bowlers[run.ids.b2!]).toMatchObject({ legalBalls: 3, maidens: 0 });
  });
});

describe('dismissals', () => {
  const inPlay = ['innings A a1 a2', 'bowler b1'];

  it('allows only a run-out off a free hit, and the free hit carries over a wide', () => {
    const bowled = (ids: Record<string, string>) =>
      delivery({ wicket: { kind: 'bowled', batterId: ids.a1! } });
    expect(check([...inPlay, 'nb'], bowled).ok).toBe(false);
    expect(check([...inPlay, 'nb', 'wd'], bowled).ok).toBe(false);
    expect(check([...inPlay, 'nb', 'wd', '0'], bowled).ok).toBe(true);
    const runOut = (ids: Record<string, string>) =>
      delivery({ runs: 1, wicket: { kind: 'run_out', batterId: ids.a2!, end: 'striker' } });
    expect(check([...inPlay, 'nb'], runOut).ok).toBe(true);
  });

  it('allows stumping off a wide but not off a no-ball', () => {
    const stumped = (kind: 'wide' | 'no_ball_bat') => (ids: Record<string, string>) =>
      delivery({ kind, wicket: { kind: 'stumped', batterId: ids.a1!, fielderId: ids.b4! } });
    expect(check(inPlay, stumped('wide')).ok).toBe(true);
    expect(check(inPlay, stumped('no_ball_bat')).ok).toBe(false);
  });

  it('only lets the non-striker be out run out', () => {
    const r = check(inPlay, (ids) => delivery({ wicket: { kind: 'bowled', batterId: ids.a2! } }));
    expect(!r.ok && r.error.code).toBe('NOT_STRIKER');
  });

  it('scores no runs with a catch', () => {
    const r = check(inPlay, (ids) =>
      delivery({ runs: 1, wicket: { kind: 'caught', batterId: ids.a1!, fielderId: ids.b2! } }),
    );
    expect(!r.ok && r.error.code).toBe('NO_RUNS');
  });

  it('puts the new batter where a run-out happened', () => {
    // a1 and a2 complete one run; a1 is run out going for a second at the striker's end.
    const run = play([...inPlay, '1+W:run_out:a1:striker', 'next a3']);
    const inn = currentInnings(run.projection.state)!;
    expect(inn.atStrikerEnd).toBe(run.ids.a3);
    expect(inn.atNonStrikerEnd).toBe(run.ids.a2);
    expect(inn.runs).toBe(1);
  });

  it('brings the new batter on strike after a catch, even if the batters crossed', () => {
    const run = play([...inPlay, 'W:caught:b2', 'next a3']);
    expect(currentInnings(run.projection.state)!.atStrikerEnd).toBe(run.ids.a3);
  });
});

describe('retirements, declarations and concessions', () => {
  const inPlay = ['innings A a1 a2', 'bowler b1', '1'];

  it('lets a retired-hurt batter come back, without counting a wicket', () => {
    const run = play([...inPlay, 'retire a2 hurt', 'next a3', '0', 'W', 'next a2']);
    const inn = currentInnings(run.projection.state)!;
    expect(inn.wickets).toBe(1);
    expect(inn.batters[run.ids.a2!]!.status).toBe('batting');
    expect(inn.atStrikerEnd).toBe(run.ids.a2);
  });

  it('counts retired out as a wicket not credited to the bowler', () => {
    const run = play([...inPlay, 'retire a1 out', 'next a3']);
    const inn = currentInnings(run.projection.state)!;
    expect(inn.wickets).toBe(1);
    expect(inn.bowlers[run.ids.b1!]!.wickets).toBe(0);
  });

  it('ends the innings on a declaration', () => {
    const run = play([...inPlay, 'declare']);
    expect(run.projection.state.phase).toBe('innings_break');
    expect(run.projection.state.innings[0]!.closed).toBe('declared');
  });

  it('ends the match when a side concedes', () => {
    const run = play(inPlay);
    const r = append(engine, run.projection, run.events, {
      seq: run.events.length + 1,
      kind: 'COMMAND',
      occurredAt: 1,
      payload: { type: 'concede', side: 0, reason: 'forfeit' },
    });
    expect(r.ok && engine.result(r.value.state)).toMatchObject({ status: 'won', winnerSide: 1 });
  });
});

describe('properties', () => {
  type Step = { runs: number; extra: number; wicket: boolean } | { undo: true };
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    {
      weight: 10,
      arbitrary: fc.record({
        runs: fc.constantFrom(0, 0, 1, 1, 2, 3, 4, 6),
        extra: fc.nat(9),
        wicket: fc.boolean(),
      }),
    },
    { weight: 1, arbitrary: fc.constant({ undo: true as const }) },
  );
  const configArb = fc.record({
    preset: fc.constantFrom(...cricketPresets.map((p) => p.config)),
    players: fc.integer({ min: 2, max: 5 }),
  });

  /** Drives a whole match, picking whatever the engine needs next; returns every state seen. */
  function simulate(config: CricketSettings, players: number, steps: Step[]) {
    const ids = Array.from({ length: players * 2 }, (_, i) => cricketParticipantId(i));
    const sides: [string[], string[]] = [ids.slice(0, players), ids.slice(players)];
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: 'cricket',
          presetKey: 'p',
          presetVersion: 1,
          config,
          roster: {
            sides: [
              { side: 0, participantIds: sides[0] },
              { side: 1, participantIds: sides[1] },
            ],
          },
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
    ];
    const start = replay(engine, events);
    if (!start.ok) throw new Error(start.error.message);
    let p = start.value;
    const states: CricketState[] = [];
    const tryAppend = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>) => {
      const event = { ...e, seq: events.length + 1, occurredAt: events.length } as LedgerEvent;
      const r = append(engine, p, events, event);
      if (r.ok) {
        p = r.value;
        events.push(event);
        states.push(p.state);
      }
      return r.ok;
    };
    const cmd = (payload: CricketCommand) => tryAppend({ kind: 'COMMAND', payload });

    for (const step of steps) {
      const s = p.state;
      if (s.phase === 'complete') break;
      if ('undo' in step) {
        const last = [...p.timeline].reverse().find((t) => !t.voidedBy && t.kind === 'COMMAND');
        if (last) tryAppend({ kind: 'VOID', targetSeq: last.seq, payload: {} });
        continue;
      }
      const inn = currentInnings(s);
      if (s.phase === 'pre_match' || s.phase === 'innings_break') {
        const side = s.innings.length === 0 ? 0 : undefined;
        const bat =
          side ??
          (s.innings.length % 2 === 1
            ? ((1 - s.innings[s.innings.length - 1]!.battingSide) as 0 | 1)
            : s.innings[s.innings.length - 1]!.battingSide);
        cmd({
          type: 'start_innings',
          ...(side !== undefined ? { battingSide: side } : {}),
          strikerId: sides[bat][0]!,
          nonStrikerId: sides[bat][1]!,
        });
      } else if (s.phase === 'awaiting_bowler') {
        for (const id of sides[inn!.bowlingSide])
          if (cmd({ type: 'set_bowler', bowlerId: id })) break;
      } else if (s.phase === 'awaiting_batter') {
        cmd({ type: 'next_batter', batterId: availableBatters(s, inn!)[0]! });
      } else {
        const kinds = ['bat', 'bat', 'bat', 'wide', 'no_ball_bat', 'bye', 'leg_bye'] as const;
        const kind = kinds[step.extra % kinds.length]!;
        const boundary = step.runs === 4 || step.runs === 6;
        const runs = step.runs === 6 && kind !== 'bat' && kind !== 'no_ball_bat' ? 4 : step.runs;
        const wicket =
          step.wicket && step.extra < 3
            ? { kind: 'bowled' as const, batterId: inn!.atStrikerEnd! }
            : undefined;
        if (
          !cmd({
            type: 'delivery',
            kind,
            runs: wicket ? 0 : runs,
            boundary: wicket ? false : boundary,
            ...(wicket ? { wicket } : {}),
          })
        ) {
          cmd({ type: 'delivery', kind: 'bat', runs: 0, boundary: false });
        }
      }
    }
    return { events, p, states };
  }

  function checkInvariants(state: CricketState) {
    for (const inn of state.innings) {
      const e = inn.extras;
      const batterRuns = Object.values(inn.batters).reduce((sum, b) => sum + b.runs, 0);
      expect(inn.runs).toBe(batterRuns + e.wides + e.noBalls + e.byes + e.legByes + e.penalties);
      const bowlerRuns = Object.values(inn.bowlers).reduce((sum, b) => sum + b.runs, 0);
      expect(bowlerRuns).toBe(inn.runs - e.byes - e.legByes - e.penalties);
      const bowlerBalls = Object.values(inn.bowlers).reduce((sum, b) => sum + b.legalBalls, 0);
      expect(bowlerBalls).toBe(inn.legalBalls);
      expect(inn.legalBalls).toBeLessThanOrEqual(inn.maxBalls);
      expect(inn.wickets).toBeLessThanOrEqual(inn.maxWickets);
      expect(Object.values(inn.batters).filter((b) => b.status === 'out').length).toBe(inn.wickets);
      expect(inn.fallOfWickets).toHaveLength(inn.wickets);
      if (inn.atStrikerEnd && inn.atNonStrikerEnd)
        expect(inn.atStrikerEnd).not.toBe(inn.atNonStrikerEnd);
      for (const id of [inn.atStrikerEnd, inn.atNonStrikerEnd]) {
        if (id && !inn.closed) expect(inn.batters[id]!.status).toBe('batting');
      }
    }
    if (state.phase === 'in_play') expect(currentInnings(state)!.atStrikerEnd).not.toBeNull();
  }

  it('drives a whole match, through a tie and a super over, to a result', () => {
    const config = { ...t20, oversPerInnings: 3, maxOversPerBowler: null, playersPerSide: 4 };
    const singles = Array.from({ length: 400 }, () => ({ runs: 1, extra: 0, wicket: false }));
    const { p, states } = simulate(config, 4, singles);
    expect(p.status).toBe('completed');
    expect(p.state.innings.map((i) => i.runs)).toEqual([18, 18, 6, 6]);
    expect(p.state.outcome).toEqual({ kind: 'tie' });
    states.forEach(checkInvariants);
  });

  it('keeps runs, balls and wickets consistent through any innings, with undos', () => {
    fc.assert(
      fc.property(
        configArb,
        fc.array(stepArb, { maxLength: 250 }),
        ({ preset, players }, steps) => {
          const config = {
            ...preset,
            oversPerInnings: Math.min(preset.oversPerInnings, 3),
            maxOversPerBowler: null,
            playersPerSide: Math.max(preset.playersPerSide, players),
          };
          const { states } = simulate(config, players, steps);
          states.forEach(checkInvariants);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('replays to the state reached by incremental appends', () => {
    fc.assert(
      fc.property(
        configArb,
        fc.array(stepArb, { maxLength: 200 }),
        ({ preset, players }, steps) => {
          const config = {
            ...preset,
            oversPerInnings: Math.min(preset.oversPerInnings, 2),
            maxOversPerBowler: null,
            playersPerSide: Math.max(preset.playersPerSide, players),
          };
          const { events, p } = simulate(config, players, steps);
          const r = replay(engine, events);
          expect(r.ok && r.value.state).toEqual(p.state);
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe('custom rules', () => {
  const wideRule = (threshold: number, runs: number): Rule => ({
    id: 'wides',
    name: 'Wides in a row',
    priority: 0,
    trigger: 'ball',
    conditions: [
      { source: 'fact', key: 'kind', op: 'eq', value: 'wide' },
      { source: 'state', key: 'consecutive_wides', op: 'gte', value: threshold },
    ],
    actions: [
      { command: 'penalty_runs', params: { runs } },
      { command: 'reset_wide_count', params: {} },
    ],
  });
  const withRules = (rules: Rule[], script: string[], config = small) =>
    runCricketGoldenLog({
      name: 'test',
      source: 'test',
      config,
      rules,
      players: { A, B },
      script,
      expected: { innings: [], summary: '', winner: null },
    });

  it('accepts only rules built from the cricket catalogue', () => {
    expect(validateRules(cricketRuleCatalogue, [wideRule(3, 1)])).toEqual([]);
    const bad = { ...wideRule(3, 1), actions: [{ command: 'add_wicket', params: {} }] };
    expect(validateRules(cricketRuleCatalogue, [bad]).map((p) => p.code)).toEqual([
      'UNKNOWN_COMMAND',
    ]);
  });

  it('gives penalty runs after wides in a row, and the count starts again', () => {
    const run = withRules([wideRule(2, 5)], ['innings A a1 a2', 'bowler b1', 'wd wd wd wd wd 1']);
    const inn = currentInnings(run.projection.state)!;
    expect(inn.extras).toMatchObject({ wides: 5, penalties: 10 });
    expect(inn.runs).toBe(16);
    expect(inn.consecutiveWides).toBe(0);
    const fired = run.projection.timeline.flatMap((t) => t.derived ?? []);
    expect(fired.map((d) => d.command?.type)).toEqual([
      'penalty_runs',
      'reset_wide_count',
      'penalty_runs',
      'reset_wide_count',
    ]);
    // Team runs and extras in the statistics include the rule's runs.
    const stats = engine.stats(run.projection.state);
    expect(stats.find((r) => r.metric === 'runs' && !r.participantId)?.value).toBe(16);
    expect(stats.find((r) => r.metric === 'extras' && !r.participantId)?.value).toBe(15);
  });

  it('drops the penalty when the wide that earned it is undone', () => {
    const run = withRules([wideRule(2, 5)], ['innings A a1 a2', 'bowler b1', 'wd wd']);
    const last = run.events.at(-1)!;
    const voided = replay(engine, [
      ...run.events,
      {
        seq: last.seq + 1,
        kind: 'VOID',
        targetSeq: last.seq,
        occurredAt: last.occurredAt + 1,
        payload: {},
      },
    ]);
    expect(voided.ok && currentInnings(voided.value.state)!.runs).toBe(1);
  });

  it('ends a chase when penalty runs reach the target', () => {
    const run = withRules(
      [wideRule(2, 5)],
      [
        'innings A a1 a2',
        'bowler b1',
        '4! 0 0 0 0 0',
        'declare',
        'innings b1 b2',
        'bowler a1',
        'wd wd',
      ],
    );
    expect(run.projection.state.phase).toBe('complete');
    expect(run.projection.status).toBe('completed');
    expect(currentInnings(run.projection.state)!.closed).toBe('target');
  });

  it('refuses penalty runs outside an innings', () => {
    expect(engine.validate(play([]).projection.state, { type: 'penalty_runs', runs: 5 }).ok).toBe(
      false,
    );
  });
});
