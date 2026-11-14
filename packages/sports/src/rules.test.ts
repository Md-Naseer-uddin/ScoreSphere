import { newId, type Rule } from '@scoresphere/contracts';
import { type LedgerEvent, replay, type RuleField, validateRules } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { badmintonPresets } from './badminton/settings.js';
import { chessPresets } from './chess/settings.js';
import { type AnySportEngine, latestEngine } from './engines.js';
import { previewRules } from './rule-preview.js';
import { tennisPresets } from './tennis/settings.js';
import { volleyballPresets } from './volleyball/settings.js';

const PILOT = [
  'badminton',
  'basketball',
  'chess',
  'cricket',
  'field-hockey',
  'football',
  'tennis',
  'volleyball',
] as const;

/** A valid value for a field: its first option, or its minimum. */
const sample = (f: RuleField) =>
  f.options?.[0] ?? (f.type === 'number' ? (f.min ?? 1) : f.type === 'boolean' ? true : 'x');

describe('rule catalogues', () => {
  it.each(PILOT)('%s declares one, and every action is a real engine command', (sport) => {
    const engine = latestEngine(sport)!;
    const catalogue = engine.ruleCatalogue!;
    expect(catalogue.triggers.length).toBeGreaterThan(0);
    for (const command of catalogue.commands) {
      const params = Object.fromEntries(command.params.map((p) => [p.key, sample(p)]));
      expect(engine.commandSchema.safeParse({ ...params, type: command.type }).success).toBe(true);
    }
    for (const field of [...catalogue.variables, ...catalogue.triggers.flatMap((t) => t.fields)]) {
      if (field.optionLabels) expect(field.optionLabels).toHaveLength(field.options!.length);
    }
  });

  it.each(PILOT)('%s reports a value for every variable it declares', (sport) => {
    const engine = latestEngine(sport)!;
    const keys = engine.ruleCatalogue!.variables.map((v) => v.key).sort();
    const preset = engine.presets[0]!;
    // Badminton and tennis presets leave singles or doubles to the wizard.
    const roster = {
      sides: ([0, 1] as const).map((side) => ({ side, participantIds: [newId(), newId()] })),
    };
    const state = engine.init({ discipline: 'singles', ...preset.config }, roster);
    expect(Object.keys(engine.ruleVariables!(state)).sort()).toEqual(keys);
  });
});

/** Plays commands through a ledger that carries `rules`. */
function play(
  engine: AnySportEngine,
  config: unknown,
  players: number,
  rules: Rule[],
  commands: (ids: [string[], string[]]) => Record<string, unknown>[],
) {
  const ids: [string[], string[]] = [
    Array.from({ length: players }, () => newId()),
    Array.from({ length: players }, () => newId()),
  ];
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 1000,
      payload: {
        sport: engine.sport,
        presetKey: 'test',
        presetVersion: 1,
        config,
        roster: { sides: ids.map((participantIds, side) => ({ side, participantIds })) },
        rules,
      },
    },
    { seq: 2, kind: 'LIFECYCLE', occurredAt: 2000, payload: { action: 'START' } },
  ];
  for (const payload of commands(ids)) {
    const seq = events.length + 1;
    events.push({ seq, kind: 'COMMAND', occurredAt: seq * 1000, payload });
  }
  const r = replay(engine, events);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** "Mercy rule": three points in a row by the first side give the second side a point. */
const mercy = (command: string, trigger = 'point'): Rule => ({
  id: 'mercy',
  name: 'Mercy point',
  priority: 0,
  trigger,
  conditions: [
    { source: 'fact', key: 'side', op: 'eq', value: 0 },
    { source: 'state', key: 'streak', op: 'eq', value: 3 },
  ],
  actions: [{ command, params: { winner: 1 } }],
});

describe('rules in the pilot sports', () => {
  it('badminton: a rule point is a rally won by that side', () => {
    const engine = latestEngine('badminton')!;
    const rule = mercy('rally');
    expect(validateRules(engine.ruleCatalogue!, [rule])).toEqual([]);
    const singles = { ...badmintonPresets[0]!.config, discipline: 'singles' };
    const p = play(engine, singles, 1, [rule], () => [
      { type: 'start_game', servingSide: 0 },
      { type: 'rally', winner: 0 },
      { type: 'rally', winner: 0 },
      { type: 'rally', winner: 0 },
    ]);
    expect(p.state.games[0].points).toEqual([3, 1]);
    expect(p.state.servingSide).toBe(1);
  });

  it('tennis: a rule can give a point when a game is won', () => {
    const engine = latestEngine('tennis')!;
    const rule: Rule = {
      id: 'set-bonus',
      name: 'Set bonus',
      priority: 0,
      trigger: 'game_won',
      conditions: [{ source: 'fact', key: 'side', op: 'eq', value: 0 }],
      actions: [{ command: 'point', params: { winner: 0 } }],
    };
    expect(validateRules(engine.ruleCatalogue!, [rule])).toEqual([]);
    const singles = { ...tennisPresets[0]!.config, discipline: 'singles' };
    const p = play(engine, singles, 1, [rule], () => [
      { type: 'start_match', servingSide: 0 },
      ...Array.from({ length: 4 }, () => ({ type: 'point', winner: 0 })),
    ]);
    expect(p.state.game.points).toEqual([1, 0]);
  });

  it('volleyball: a rule point wins the serve', () => {
    const engine = latestEngine('volleyball')!;
    const rule: Rule = {
      id: 'deuce-bonus',
      name: 'Bonus at 2 all',
      priority: 0,
      trigger: 'point',
      conditions: [
        { source: 'state', key: 'points_side1', op: 'eq', value: 2 },
        { source: 'state', key: 'points_side2', op: 'eq', value: 2 },
      ],
      actions: [{ command: 'rally', params: { winner: 1 } }],
    };
    expect(validateRules(engine.ruleCatalogue!, [rule])).toEqual([]);
    const config = { ...volleyballPresets[0]!.config, playersOnCourt: 2 };
    const p = play(engine, config, 2, [rule], (ids) => [
      { type: 'start_set', servingSide: 0, lineups: ids },
      { type: 'rally', winner: 0 },
      { type: 'rally', winner: 1 },
      { type: 'rally', winner: 0 },
      { type: 'rally', winner: 1 },
    ]);
    expect(p.state.sets[0].points).toEqual([2, 3]);
    expect(p.state.serving).toBe(1);
  });

  it('chess: a rule can add time after a number of moves', () => {
    const engine = latestEngine('chess')!;
    const rule: Rule = {
      id: 'move-two',
      name: 'Bonus after move 2',
      priority: 0,
      trigger: 'press',
      conditions: [
        { source: 'fact', key: 'side', op: 'eq', value: 1 },
        { source: 'state', key: 'moves_side2', op: 'eq', value: 2 },
      ],
      actions: [
        { command: 'add_time', params: { side: 0, seconds: 60 } },
        { command: 'add_time', params: { side: 1, seconds: 60 } },
      ],
    };
    expect(validateRules(engine.ruleCatalogue!, [rule])).toEqual([]);
    const config = chessPresets.find((x) => x.config.timeControl)!.config;
    const base = config.timeControl!.baseMs;
    const p = play(engine, config, 1, [rule], () => [
      { type: 'start_clock', whiteSide: 0 },
      { type: 'press', side: 0 },
      { type: 'press', side: 1 },
      { type: 'press', side: 0 },
      { type: 'press', side: 1 },
    ]);
    const inc = config.timeControl!.incrementMs;
    // Each press was 1 s after the last, so each side used 2 s and gained two increments.
    expect(p.state.clocks[0].remainingMs).toBe(base - 2000 + 2 * inc + 60_000);
    expect(p.state.clocks[1].remainingMs).toBe(base - 2000 + 2 * inc + 60_000);
  });
});

describe('rule preview', () => {
  it.each(PILOT)('%s has a sample game that runs under its presets', (sport) => {
    const engine = latestEngine(sport)!;
    for (const preset of engine.presets) {
      const config = { discipline: 'singles', ...preset.config };
      const preview = previewRules(engine, config, []);
      expect(preview, preset.key).not.toBeNull();
      // A chess game with no clock has only its start: its rules are about the clock.
      expect(preview!.timeline.length, preset.key).toBeGreaterThan(0);
      // The sample plays through every event the preset allows, except chess without a clock.
      if (sport !== 'chess') expect(preview!.timeline.length, preset.key).toBeGreaterThan(4);
      expect(preview!.summary).toBe(preview!.summaryWithout);
    }
  });

  it('shows what the cricket wide rule does in the sample over', () => {
    const engine = latestEngine('cricket')!;
    const rule: Rule = {
      id: 'wides',
      name: 'Three wides',
      priority: 0,
      trigger: 'ball',
      conditions: [{ source: 'state', key: 'consecutive_wides', op: 'gte', value: 3 }],
      actions: [
        { command: 'penalty_runs', params: { runs: 5 } },
        { command: 'reset_wide_count', params: {} },
      ],
    };
    const config = engine.presets.find((p) => p.key === 't20')!.config as Record<string, unknown>;
    const preview = previewRules(engine, config, [rule])!;
    const fired = preview.timeline.filter((t) => t.derived?.length);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.derived!.map((d) => d.command?.type)).toEqual([
      'penalty_runs',
      'reset_wide_count',
    ]);
    expect(preview.summary).not.toBe(preview.summaryWithout);
  });
});
