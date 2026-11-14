import { newId, type Rule } from '@scoresphere/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SportEngine } from './engine.js';
import { append, type LedgerEvent, type MatchProjection, replay } from './ledger.js';
import { err, ok } from './result.js';
import { type RuleCatalogue, RULE_LIMITS, ruleMatches, rulesFor, validateRules } from './rules.js';

/**
 * A toy engine with a rule catalogue: first to `target`. A side's run of consecutive points
 * is a state variable, and rules may award `bonus` points or reset the run.
 */
const side = z.union([z.literal(0), z.literal(1)]);
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), side }),
  z.object({ type: z.literal('bonus'), side, points: z.int().min(1).max(10) }),
  z.object({ type: z.literal('reset_run') }),
]);
type Command = z.infer<typeof commandSchema>;
interface State {
  target: number;
  score: [number, number];
  run: number;
  runSide: 0 | 1 | null;
}

const catalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'point',
      label: 'Point',
      fields: [{ key: 'side', label: 'Side', type: 'number', options: [0, 1] }],
    },
    { fact: 'bonus', label: 'Bonus', fields: [{ key: 'points', label: 'Points', type: 'number' }] },
  ],
  variables: [
    { key: 'run', label: 'Run of points', type: 'number', min: 0 },
    { key: 'leader', label: 'Leader', type: 'string', options: ['home', 'away', 'level'] },
  ],
  commands: [
    {
      type: 'bonus',
      label: 'Award bonus points',
      params: [
        { key: 'side', label: 'Side', type: 'number', options: [0, 1] },
        { key: 'points', label: 'Points', type: 'number', min: 1, max: 10 },
      ],
    },
    { type: 'reset_run', label: 'Reset the run', params: [] },
  ],
};

const engine: SportEngine<State, { target: number }, Command> = {
  sport: 'badminton',
  version: 1,
  settingsSchema: z.object({ target: z.int().min(1) }),
  commandSchema,
  presets: [],
  validateSetup: () => ok(undefined),
  init: (config) => ({ target: config.target, score: [0, 0], run: 0, runSide: null }),
  commands: () => [],
  validate: (state, cmd) =>
    cmd.type === 'reset_run' && state.run === 0
      ? err({ code: 'NO_RUN', message: 'There is no run to reset.' })
      : state.score.some((s) => s >= state.target)
        ? err({ code: 'OVER', message: 'The match is over.' })
        : ok(undefined),
  apply: (state, cmd) => {
    if (cmd.type === 'reset_run') return { state: { ...state, run: 0, runSide: null }, facts: [] };
    const score: [number, number] = [...state.score];
    if (cmd.type === 'bonus') {
      score[cmd.side] += cmd.points;
      return {
        state: { ...state, score },
        facts: [{ type: 'bonus', data: { points: cmd.points } }],
      };
    }
    score[cmd.side] += 1;
    const run = state.runSide === cmd.side ? state.run + 1 : 1;
    return {
      state: { ...state, score, run, runSide: cmd.side },
      facts: [{ type: 'point', data: { side: cmd.side } }],
    };
  },
  isComplete: (state) => state.score.some((s) => s >= state.target),
  result: (state) => ({ status: 'in_progress', summary: state.score.join('-') }),
  stats: () => [],
  ruleCatalogue: catalogue,
  ruleVariables: (state) => ({
    run: state.run,
    leader:
      state.score[0] > state.score[1] ? 'home' : state.score[1] > state.score[0] ? 'away' : 'level',
  }),
};

/** "Three in a row by the home side earns 2 bonus points, then the run starts again." */
const streakRule: Rule = {
  id: 'home-streak',
  name: 'Home streak bonus',
  priority: 10,
  trigger: 'point',
  conditions: [
    { source: 'fact', key: 'side', op: 'eq', value: 0 },
    { source: 'state', key: 'run', op: 'gte', value: 3 },
  ],
  actions: [
    { command: 'bonus', params: { side: 0, points: 2 } },
    { command: 'reset_run', params: {} },
  ],
};

const created = (rules: Rule[], target = 20): LedgerEvent => ({
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
    rules,
  },
});

function ledger(rules: Rule[], points: (0 | 1)[], target = 20): LedgerEvent[] {
  const events: LedgerEvent[] = [
    created(rules, target),
    { seq: 2, kind: 'LIFECYCLE', occurredAt: 2000, payload: { action: 'START' } },
  ];
  for (const s of points) {
    const seq = events.length + 1;
    events.push({
      seq,
      kind: 'COMMAND',
      occurredAt: seq * 1000,
      payload: { type: 'point', side: s },
    });
  }
  return events;
}

function fold(events: LedgerEvent[]): MatchProjection<State, { target: number }, Command> {
  const r = replay(engine, events);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('validateRules', () => {
  const problems = (rule: Partial<Rule>) =>
    validateRules(catalogue, [{ ...streakRule, ...rule }]).map((p) => p.code);

  it('accepts rules built from the catalogue', () => {
    expect(validateRules(catalogue, [streakRule])).toEqual([]);
  });

  it('blocks duplicate IDs', () => {
    expect(validateRules(catalogue, [streakRule, streakRule]).map((p) => p.code)).toEqual([
      'DUPLICATE_ID',
    ]);
  });

  it('blocks triggers, fields and commands the sport does not declare', () => {
    expect(problems({ trigger: 'goal', conditions: [] })).toEqual(['UNKNOWN_TRIGGER']);
    expect(problems({ conditions: [{ source: 'fact', key: 'run', op: 'eq', value: 1 }] })).toEqual([
      'UNKNOWN_FIELD',
    ]);
    expect(
      problems({ conditions: [{ source: 'state', key: 'side', op: 'eq', value: 1 }] }),
    ).toEqual(['UNKNOWN_FIELD']);
    expect(problems({ actions: [{ command: 'set_score', params: {} }] })).toEqual([
      'UNKNOWN_COMMAND',
    ]);
  });

  it('blocks comparisons that do not fit the field', () => {
    expect(
      problems({ conditions: [{ source: 'state', key: 'leader', op: 'gt', value: 'home' }] }),
    ).toEqual(['BAD_OPERATOR']);
    expect(
      problems({ conditions: [{ source: 'state', key: 'run', op: 'eq', value: 'three' }] }),
    ).toEqual(['BAD_VALUE']);
    expect(problems({ conditions: [{ source: 'state', key: 'run', op: 'in', value: 3 }] })).toEqual(
      ['BAD_VALUE'],
    );
    expect(
      problems({ conditions: [{ source: 'state', key: 'run', op: 'eq', value: [3] }] }),
    ).toEqual(['BAD_VALUE']);
    expect(
      problems({
        conditions: [{ source: 'state', key: 'leader', op: 'in', value: ['home', 'nobody'] }],
      }),
    ).toEqual(['BAD_VALUE']);
    expect(
      problems({ conditions: [{ source: 'state', key: 'run', op: 'lt', value: -1 }] }),
    ).toEqual(['BAD_VALUE']);
  });

  it('blocks missing, unknown and out-of-range action settings', () => {
    expect(problems({ actions: [{ command: 'bonus', params: { side: 0 } }] })).toEqual([
      'MISSING_PARAM',
    ]);
    expect(problems({ actions: [{ command: 'bonus', params: { side: 0, points: 11 } }] })).toEqual([
      'BAD_PARAM',
    ]);
    expect(problems({ actions: [{ command: 'reset_run', params: { hard: true } }] })).toEqual([
      'UNKNOWN_PARAM',
    ]);
  });
});

describe('rule matching', () => {
  it('compares fact fields and state variables', () => {
    const fact = { type: 'point', data: { side: 0 } };
    expect(ruleMatches(streakRule, fact, { run: 3 })).toBe(true);
    expect(ruleMatches(streakRule, fact, { run: 2 })).toBe(false);
    expect(ruleMatches(streakRule, { type: 'point', data: { side: 1 } }, { run: 3 })).toBe(false);
    expect(ruleMatches(streakRule, { type: 'bonus', data: {} }, { run: 3 })).toBe(false);
  });

  it('fires in priority order, then by ID', () => {
    const a = { ...streakRule, id: 'a', priority: 1 };
    const b = { ...streakRule, id: 'b', priority: 5 };
    const c = { ...streakRule, id: 'c', priority: 5 };
    expect(rulesFor([a, c, b], 'point').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('rules in the ledger', () => {
  it('applies effects as derived entries on the triggering event', () => {
    const p = fold(ledger([streakRule], [0, 0, 0]));
    expect(p.state.score).toEqual([5, 0]);
    expect(p.state.run).toBe(0);
    const trigger = p.timeline.at(-1)!;
    expect(trigger.derived?.map((d) => [d.kind, d.seq, d.ruleId, d.command?.type])).toEqual([
      ['DERIVED', 5, 'home-streak', 'bonus'],
      ['DERIVED', 5, 'home-streak', 'reset_run'],
    ]);
    expect(trigger.derived?.[0]!.facts).toEqual([{ type: 'bonus', data: { points: 2 } }]);
    // The reset means the next home point starts a new run.
    expect(fold(ledger([streakRule], [0, 0, 0, 0])).state.score).toEqual([6, 0]);
  });

  it('does nothing when no condition holds', () => {
    const p = fold(ledger([streakRule], [0, 0, 1, 0, 0]));
    expect(p.state.score).toEqual([4, 1]);
    expect(p.timeline.some((t) => t.derived)).toBe(false);
  });

  it('removes effects when the triggering event is undone', () => {
    const events = ledger([streakRule], [0, 0, 0]);
    events.push({ seq: 6, kind: 'VOID', occurredAt: 6000, targetSeq: 5, payload: {} });
    const p = fold(events);
    expect(p.state.score).toEqual([2, 0]);
    expect(p.timeline.some((t) => t.derived)).toBe(false);
  });

  it('re-evaluates effects after a correction', () => {
    const events = ledger([streakRule], [0, 1, 0]);
    events.push({
      seq: 6,
      kind: 'REPLACE',
      occurredAt: 6000,
      targetSeq: 4,
      payload: { type: 'point', side: 0 },
    });
    expect(fold(events).state.score).toEqual([5, 0]);
  });

  it('completes the match when an effect reaches the target', () => {
    const p = fold(ledger([streakRule], [0, 0, 0], 4));
    expect(p.status).toBe('completed');
    expect(p.state.score).toEqual([5, 0]);
    expect(p.timeline.at(-1)!.derived?.[1]!.invalid?.engineCode).toBe('OVER');
  });

  it('records an effect the engine refuses without stopping the match', () => {
    const resetFirst: Rule = {
      ...streakRule,
      id: 'reset',
      conditions: [],
      actions: [
        { command: 'reset_run', params: {} },
        { command: 'reset_run', params: {} },
      ],
    };
    const p = fold(ledger([resetFirst], [0, 1]));
    expect(p.status).toBe('live');
    const derived = p.timeline.at(-1)!.derived!;
    expect(derived[0]!.invalid).toBeUndefined();
    expect(derived[1]!.invalid?.engineCode).toBe('NO_RUN');
  });

  it('stops chains at the depth limit', () => {
    // r1 awards 1, r2 answers a 1-point bonus with 2, r3 a 2 with 3, r4 a 3 with 4.
    const link = (id: string, after: number | null, points: number): Rule => ({
      id,
      name: id,
      priority: 0,
      trigger: after === null ? 'point' : 'bonus',
      conditions: after === null ? [] : [{ source: 'fact', key: 'points', op: 'eq', value: after }],
      actions: [{ command: 'bonus', params: { side: 1, points } }],
    });
    const rules = [link('r1', null, 1), link('r2', 1, 2), link('r3', 2, 3), link('r4', 3, 4)];
    const p = fold(ledger(rules, [0]));
    expect(p.timeline.at(-1)!.derived!.map((d) => d.ruleId)).toEqual(['r1', 'r2', 'r3']);
    expect(RULE_LIMITS.maxDepth).toBe(3);
    expect(p.state.score).toEqual([1, 6]);
  });

  it('fires each rule at most once per event, so cycles end', () => {
    const echo: Rule = {
      id: 'echo',
      name: 'Echo',
      priority: 0,
      trigger: 'bonus',
      conditions: [],
      actions: [{ command: 'bonus', params: { side: 1, points: 1 } }],
    };
    const start: Rule = { ...echo, id: 'start', trigger: 'point' };
    const p = fold(ledger([start, echo], [0]));
    expect(p.timeline.at(-1)!.derived!.map((d) => d.ruleId)).toEqual(['start', 'echo']);
    expect(p.state.score).toEqual([1, 2]);
  });

  it('refuses a match whose rules do not fit the sport', () => {
    const r = replay(engine, ledger([{ ...streakRule, trigger: 'goal' }], []));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('BAD_PAYLOAD');
    const plain = { ...engine, ruleCatalogue: undefined };
    expect(replay(plain, ledger([streakRule], [])).ok).toBe(false);
  });

  it('gives the same result folded incrementally and replayed', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom<0 | 1>(0, 1), { maxLength: 40 }), (points) => {
        const events = ledger([streakRule], points, 30);
        let p = fold(events.slice(0, 2));
        const accepted: LedgerEvent[] = events.slice(0, 2);
        for (const e of events.slice(2)) {
          const next = append(engine, p, accepted, e);
          if (!next.ok) break;
          p = next.value;
          accepted.push(e);
        }
        const replayed = fold(accepted);
        expect(replayed.state).toEqual(p.state);
        expect(replayed.timeline).toEqual(p.timeline);
      }),
    );
  });
});
