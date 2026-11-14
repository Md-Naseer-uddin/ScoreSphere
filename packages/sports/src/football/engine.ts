import { idSchema, type MatchResult, type MatchRoster } from '@scoresphere/contracts';
import {
  type ApplyContext,
  beginPeriod,
  type CommandDescriptor,
  type DomainFact,
  endPeriod,
  type EngineError,
  err,
  holdPeriodClock,
  matchMinute,
  type MetricRecord,
  newPeriodClock,
  ok,
  type PeriodClock,
  periodElapsed,
  type Result,
  runPeriodClock,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { shootoutNext, shootoutTally, shootoutWinner } from '../shootout.js';
import { footballRuleCatalogue, footballRuleVariables } from './rules.js';
import { footballPresets, type FootballSettings, footballSettingsSchema } from './settings.js';

/**
 * Association football, version 1, following the IFAB Laws of the Game 2025/26 where a
 * setting doesn't say otherwise. The referee keeps time: the scorer starts and ends each
 * period, and time beyond a period's length is added time.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const GOAL_KINDS = ['regular', 'penalty', 'own_goal'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const footballCommandSchema = z.discriminatedUnion('type', [
  /** Starts the next period. The first needs each team's starting players. */
  z.object({
    type: z.literal('start_period'),
    lineups: z.tuple([z.array(idSchema), z.array(idSchema)]).optional(),
  }),
  z.object({ type: z.literal('end_period') }),
  /**
   * A goal for `side`. The scorer is optional; for an own goal the scorer plays for the
   * other team. Assists are optional and never on an own goal.
   */
  z.object({
    type: z.literal('goal'),
    side: sideSchema,
    kind: z.enum(GOAL_KINDS),
    scorerId: idSchema.optional(),
    assistId: idSchema.optional(),
  }),
  /** A second yellow card sends the player off (Law 12). Bench players can be carded too. */
  z.object({
    type: z.literal('card'),
    side: sideSchema,
    playerId: idSchema,
    color: z.enum(['yellow', 'red']),
  }),
  z.object({ type: z.literal('substitute'), side: sideSchema, outId: idSchema, inId: idSchema }),
  z.object({ type: z.literal('start_shootout'), firstSide: sideSchema }),
  z.object({
    type: z.literal('shootout_kick'),
    side: sideSchema,
    scored: z.boolean(),
    kickerId: idSchema.optional(),
  }),
  /** Ends the match now on the current score, e.g. from a golden-goal or mercy rule. */
  z.object({ type: z.literal('final_whistle') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
]);
export type FootballCommand = z.infer<typeof footballCommandSchema>;

export interface GoalRecord {
  side: Side;
  kind: GoalKind;
  scorerId: string | null;
  assistId: string | null;
  period: number;
  minute: number;
  added: number;
}

export interface CardRecord {
  side: Side;
  playerId: string;
  color: 'yellow' | 'red';
  /** A second yellow, which sends the player off. */
  secondYellow: boolean;
  period: number;
  minute: number;
  added: number;
}

export interface SubstitutionRecord {
  side: Side;
  outId: string;
  inId: string;
  /** Null when made between periods. */
  period: number | null;
  minute: number | null;
  added: number;
}

export interface ShootoutKick {
  side: Side;
  kickerId: string | null;
  scored: boolean;
}

export type FootballFinish = 'regular' | 'extra_time' | 'shootout' | 'forfeit' | 'walkover';

export interface FootballState {
  config: FootballSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'shootout' | 'complete';
  periods: PeriodClock;
  onField: [string[], string[]];
  /** Everyone who has been on the field (started or came on). */
  appeared: string[];
  substitutionsUsed: [number, number];
  /** Players taken off, who may not return unless substitutes roll. */
  substitutedOff: string[];
  sentOff: string[];
  yellowCards: Record<string, number>;
  score: [number, number];
  goals: GoalRecord[];
  cards: CardRecord[];
  substitutions: SubstitutionRecord[];
  shootout: { firstSide: Side; kicks: ShootoutKick[] } | null;
  outcome: { winner: Side | null; finish: FootballFinish } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export const regularPeriods = (c: FootballSettings) => c.periods;
export const totalPeriods = (c: FootballSettings) => c.periods + (c.extraTime?.periods ?? 0);

/** Kind, length and starting minute of period `n` (1-based). */
export function periodInfo(c: FootballSettings, n: number) {
  if (n <= c.periods) {
    return {
      extra: false,
      lengthMinutes: c.periodMinutes,
      startMinute: (n - 1) * c.periodMinutes,
    };
  }
  const et = c.extraTime!;
  return {
    extra: true,
    lengthMinutes: et.periodMinutes,
    startMinute: c.periods * c.periodMinutes + (n - c.periods - 1) * et.periodMinutes,
  };
}

/** How many periods of each kind the match has, so a period can be named from its facts. */
const shape = (c: FootballSettings) => ({
  regularPeriods: c.periods,
  extraPeriods: c.extraTime?.periods ?? 0,
});

/** The match minute at `now` in the current period. */
export function footballMinute(state: FootballState, now: number) {
  const n = Math.max(1, state.periods.number);
  const info = periodInfo(state.config, n);
  return matchMinute(info.startMinute, info.lengthMinutes, periodElapsed(state.periods, now));
}

export function footballSideOf(state: FootballState, playerId: string): Side | null {
  if (state.players[0].includes(playerId)) return 0;
  if (state.players[1].includes(playerId)) return 1;
  return null;
}

/** Shootout goals and kicks taken per side. */
export function shootoutScore(state: FootballState): {
  goals: [number, number];
  taken: [number, number];
} {
  return shootoutTally(state.shootout?.kicks ?? []);
}

/** The side to take the next kick: teams alternate, starting with `firstSide` (Law 10). */
export function nextKicker(state: FootballState): Side | null {
  return state.shootout
    ? shootoutNext(state.shootout.firstSide, state.shootout.kicks.length)
    : null;
}

function init(config: FootballSettings, roster: MatchRoster): FootballState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    periods: newPeriodClock(),
    onField: [[], []],
    appeared: [],
    substitutionsUsed: [0, 0],
    substitutedOff: [],
    sentOff: [],
    yellowCards: {},
    score: [0, 0],
    goals: [],
    cards: [],
    substitutions: [],
    shootout: null,
    outcome: null,
  };
}

function validateSetup(_config: FootballSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length < 1 || side.participantIds.length > 30) {
      return fail('SIDE_SIZE', 'Each team needs 1 to 30 players.');
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function validate(state: FootballState, cmd: FootballCommand): Result<void, EngineError> {
  const { config } = state;
  const onField = (side: Side, id: string | undefined) =>
    id === undefined || state.onField[side].includes(id);
  switch (cmd.type) {
    case 'start_period': {
      if (state.phase === 'pre_match') {
        if (!cmd.lineups) return fail('PICK_LINEUPS', 'Choose the starting players.');
        for (const side of [0, 1] as const) {
          const lineup = cmd.lineups[side];
          if (lineup.length < 1 || lineup.length > config.playersOnField) {
            return fail(
              'LINEUP_SIZE',
              `Each team starts with 1 to ${config.playersOnField} players.`,
            );
          }
          if (
            new Set(lineup).size !== lineup.length ||
            !lineup.every((id) => state.players[side].includes(id))
          ) {
            return fail('LINEUP_PLAYERS', 'Starting players must be in the team, once each.');
          }
        }
        return ok(undefined);
      }
      if (state.phase !== 'break') return fail('NOT_NOW', 'A period is already being played.');
      return cmd.lineups
        ? fail('LINEUPS_SET', 'Use substitutions to change players.')
        : ok(undefined);
    }
    case 'end_period':
      return state.phase === 'playing'
        ? ok(undefined)
        : fail('NOT_NOW', 'No period is being played.');
    case 'goal': {
      if (state.phase !== 'playing')
        return fail('NOT_NOW', 'Goals are scored while a period is played.');
      const scorerSide = cmd.kind === 'own_goal' ? other(cmd.side) : cmd.side;
      if (!onField(scorerSide, cmd.scorerId)) {
        return fail(
          'NOT_ON_FIELD',
          cmd.kind === 'own_goal'
            ? 'An own goal is scored by a player of the other team on the field.'
            : 'The scorer must be on the field for that team.',
        );
      }
      if (cmd.assistId !== undefined) {
        if (cmd.kind === 'own_goal') return fail('NO_ASSIST', 'An own goal has no assist.');
        if (!onField(cmd.side, cmd.assistId) || cmd.assistId === cmd.scorerId) {
          return fail('BAD_ASSIST', 'The assist must come from a teammate on the field.');
        }
      }
      return ok(undefined);
    }
    case 'card': {
      if (state.phase === 'complete') return fail('MATCH_OVER', 'The match is over.');
      if (!state.players[cmd.side].includes(cmd.playerId)) {
        return fail('NOT_IN_TEAM', 'That player is not in the team.');
      }
      return state.sentOff.includes(cmd.playerId)
        ? fail('SENT_OFF', 'That player has already been sent off.')
        : ok(undefined);
    }
    case 'substitute': {
      if (state.phase !== 'playing' && state.phase !== 'break') {
        return fail('NOT_NOW', 'Substitutions are made during the match.');
      }
      if (!state.onField[cmd.side].includes(cmd.outId)) {
        return fail('NOT_ON_FIELD', 'The player coming off must be on the field.');
      }
      if (
        !state.players[cmd.side].includes(cmd.inId) ||
        state.onField[cmd.side].includes(cmd.inId) ||
        state.sentOff.includes(cmd.inId)
      ) {
        return fail('NOT_AVAILABLE', 'The player coming on must be an available substitute.');
      }
      if (!config.rollingSubstitutions) {
        if (state.substitutedOff.includes(cmd.inId)) {
          return fail('NO_RETURN', 'A player who has come off may not come back on.');
        }
        if (
          config.maxSubstitutions !== null &&
          state.substitutionsUsed[cmd.side] >= config.maxSubstitutions
        ) {
          return fail(
            'SUBSTITUTION_LIMIT',
            `Each team may make ${config.maxSubstitutions} substitutions.`,
          );
        }
      }
      return ok(undefined);
    }
    case 'start_shootout':
      return state.phase === 'shootout' && !state.shootout
        ? ok(undefined)
        : fail('NOT_NOW', 'There is no shootout to start.');
    case 'shootout_kick': {
      if (state.phase !== 'shootout' || !state.shootout) {
        return fail('NOT_NOW', 'The shootout has not started.');
      }
      if (cmd.side !== nextKicker(state))
        return fail('NOT_YOUR_KICK', 'The other team kicks next.');
      if (
        cmd.kickerId !== undefined &&
        (!state.players[cmd.side].includes(cmd.kickerId) || state.sentOff.includes(cmd.kickerId))
      ) {
        return fail('NOT_AVAILABLE', 'The kicker must be an eligible player of that team.');
      }
      return ok(undefined);
    }
    case 'final_whistle':
      return state.phase === 'playing' || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

/** When a match event happened, from the period clock at `at`. */
function stamp(state: FootballState, at: number) {
  const m = footballMinute(state, at);
  return { period: state.periods.number, minute: m.minute, added: m.added };
}

/** Where the match goes once regular or extra time is over. */
function afterTime(
  state: FootballState,
  finish: 'regular' | 'extra_time',
  facts: DomainFact[],
): FootballState {
  const [a, b] = state.score;
  if (a !== b) {
    const winner: Side = a > b ? 0 : 1;
    facts.push({ type: 'match_won', data: { side: winner, finish } });
    return { ...state, phase: 'complete', outcome: { winner, finish } };
  }
  if (state.config.shootout) {
    facts.push({ type: 'shootout_needed' });
    return { ...state, phase: 'shootout' };
  }
  facts.push({ type: 'match_drawn' });
  return { ...state, phase: 'complete', outcome: { winner: null, finish } };
}

function apply(
  state: FootballState,
  cmd: FootballCommand,
  ctx: ApplyContext,
): { state: FootballState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  switch (cmd.type) {
    case 'start_period': {
      const periods = beginPeriod(state.periods, at);
      const lineups = cmd.lineups;
      const onField: [string[], string[]] = lineups
        ? [[...lineups[0]], [...lineups[1]]]
        : state.onField;
      const extra = periodInfo(state.config, periods.number).extra;
      return {
        state: {
          ...state,
          phase: 'playing',
          periods,
          onField,
          appeared: lineups ? [...lineups[0], ...lineups[1]] : state.appeared,
        },
        facts: [
          {
            type: 'period_started',
            data: { period: periods.number, extra, ...shape(state.config) },
          },
        ],
      };
    }
    case 'end_period': {
      const n = state.periods.number;
      const next = { ...state, periods: endPeriod(state.periods, at) };
      const facts: DomainFact[] = [
        {
          type: 'period_ended',
          data: { period: n, extra: periodInfo(state.config, n).extra, ...shape(state.config) },
        },
      ];
      const regular = regularPeriods(state.config);
      if (n < regular) return { state: { ...next, phase: 'break' }, facts };
      if (n === regular) {
        if (state.config.extraTime && state.score[0] === state.score[1]) {
          facts.push({ type: 'extra_time_needed' });
          return { state: { ...next, phase: 'break' }, facts };
        }
        return { state: afterTime(next, 'regular', facts), facts };
      }
      if (n < totalPeriods(state.config)) return { state: { ...next, phase: 'break' }, facts };
      return { state: afterTime(next, 'extra_time', facts), facts };
    }
    case 'goal': {
      const score: [number, number] = [...state.score];
      score[cmd.side] += 1;
      const when = stamp(state, at);
      const goal: GoalRecord = {
        side: cmd.side,
        kind: cmd.kind,
        scorerId: cmd.scorerId ?? null,
        assistId: cmd.assistId ?? null,
        ...when,
      };
      return {
        state: { ...state, score, goals: [...state.goals, goal] },
        facts: [
          {
            type: 'goal',
            data: {
              side: cmd.side,
              kind: cmd.kind,
              minute: when.minute,
              extra: periodInfo(state.config, when.period).extra,
            },
          },
        ],
      };
    }
    case 'card': {
      const yellows = (state.yellowCards[cmd.playerId] ?? 0) + (cmd.color === 'yellow' ? 1 : 0);
      const secondYellow = cmd.color === 'yellow' && yellows >= 2;
      const off = cmd.color === 'red' || secondYellow;
      const when = state.periods.number > 0 ? stamp(state, at) : { period: 0, minute: 0, added: 0 };
      const facts: DomainFact[] = [
        { type: 'card', data: { side: cmd.side, color: cmd.color, secondYellow } },
      ];
      const onField: [string[], string[]] = [...state.onField];
      if (off) {
        onField[cmd.side] = onField[cmd.side].filter((id) => id !== cmd.playerId);
        facts.push({ type: 'sent_off', data: { side: cmd.side } });
      }
      return {
        state: {
          ...state,
          onField,
          yellowCards: { ...state.yellowCards, [cmd.playerId]: yellows },
          sentOff: off ? [...state.sentOff, cmd.playerId] : state.sentOff,
          cards: [
            ...state.cards,
            { side: cmd.side, playerId: cmd.playerId, color: cmd.color, secondYellow, ...when },
          ],
        },
        facts,
      };
    }
    case 'substitute': {
      const onField: [string[], string[]] = [...state.onField];
      onField[cmd.side] = onField[cmd.side].map((id) => (id === cmd.outId ? cmd.inId : id));
      const used: [number, number] = [...state.substitutionsUsed];
      used[cmd.side] += 1;
      const during = state.phase === 'playing';
      const when = during ? stamp(state, at) : null;
      return {
        state: {
          ...state,
          onField,
          substitutionsUsed: used,
          substitutedOff: state.substitutedOff.includes(cmd.outId)
            ? state.substitutedOff
            : [...state.substitutedOff, cmd.outId],
          appeared: state.appeared.includes(cmd.inId)
            ? state.appeared
            : [...state.appeared, cmd.inId],
          substitutions: [
            ...state.substitutions,
            {
              side: cmd.side,
              outId: cmd.outId,
              inId: cmd.inId,
              period: when?.period ?? null,
              minute: when?.minute ?? null,
              added: when?.added ?? 0,
            },
          ],
        },
        facts: [{ type: 'substitution', data: { side: cmd.side } }],
      };
    }
    case 'start_shootout':
      return {
        state: { ...state, shootout: { firstSide: cmd.firstSide, kicks: [] } },
        facts: [{ type: 'shootout_started', data: { firstSide: cmd.firstSide } }],
      };
    case 'shootout_kick': {
      const shootout = {
        ...state.shootout!,
        kicks: [
          ...state.shootout!.kicks,
          { side: cmd.side, kickerId: cmd.kickerId ?? null, scored: cmd.scored },
        ],
      };
      let next: FootballState = { ...state, shootout };
      const facts: DomainFact[] = [
        { type: 'shootout_kick', data: { side: cmd.side, scored: cmd.scored } },
      ];
      const winner = shootoutWinner(state.config.shootout!.kicks, shootout.kicks);
      if (winner !== null) {
        next = { ...next, phase: 'complete', outcome: { winner, finish: 'shootout' } };
        facts.push({ type: 'match_won', data: { side: winner, finish: 'shootout' } });
      }
      return { state: next, facts };
    }
    case 'final_whistle': {
      const n = state.periods.number;
      const facts: DomainFact[] = [];
      const ended = state.phase === 'playing' ? endPeriod(state.periods, at) : state.periods;
      const finish = n > regularPeriods(state.config) ? 'extra_time' : 'regular';
      const next = afterTime({ ...state, periods: ended }, finish, facts);
      return { state: next, facts };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...state,
          phase: 'complete',
          periods: holdPeriodClock(state.periods, at),
          outcome: { winner, finish: cmd.reason },
        },
        facts: [{ type: 'match_won', data: { side: winner, finish: cmd.reason } }],
      };
    }
  }
}

/** Pausing the match stops the period clock (ADR 0006). */
function onLifecycle(state: FootballState, action: string, ctx: ApplyContext): FootballState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  if (action === 'RESUME')
    return { ...state, periods: runPeriodClock(state.periods, ctx.occurredAt) };
  return state;
}

function commands(state: FootballState): CommandDescriptor[] {
  const list: Record<FootballState['phase'], FootballCommand['type'][]> = {
    pre_match: ['start_period', 'card', 'concede'],
    playing: ['goal', 'card', 'substitute', 'end_period', 'concede'],
    break: ['start_period', 'card', 'substitute', 'concede'],
    shootout: state.shootout ? ['shootout_kick', 'concede'] : ['start_shootout', 'card', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

/** "2–1", with "a.e.t." or the shootout score when they decided it. */
export function footballScoreLine(state: FootballState): string {
  const line = `${state.score[0]}–${state.score[1]}`;
  if (state.shootout && state.shootout.kicks.length > 0) {
    const { goals } = shootoutScore(state);
    return `${line} (${goals[0]}–${goals[1]} pens)`;
  }
  if (state.periods.number > regularPeriods(state.config)) return `${line} a.e.t.`;
  return line;
}

function result(state: FootballState): MatchResult {
  const summary = footballScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary };
  const { winner, finish } = state.outcome;
  const label = finish === 'forfeit' || finish === 'walkover' ? ` (${finish})` : '';
  if (winner === null) return { status: 'drawn', summary };
  return { status: 'won', winnerSide: winner, summary: `${summary}${label}` };
}

function stats(state: FootballState): MetricRecord[] {
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => [
    { metric: 'goals_for', value: state.score[side], side },
    { metric: 'goals_against', value: state.score[other(side)], side },
    {
      metric: 'yellow_cards',
      value: state.cards.filter((c) => c.side === side && c.color === 'yellow').length,
      side,
    },
    {
      metric: 'red_cards',
      value: state.sentOff.filter((id) => state.players[side].includes(id)).length,
      side,
    },
  ]);
  for (const side of [0, 1] as const) {
    for (const participantId of state.players[side]) {
      const goals = state.goals.filter((g) => g.scorerId === participantId);
      const add = (metric: string, value: number) =>
        records.push({ metric, value, side, participantId });
      add('goals', goals.filter((g) => g.kind !== 'own_goal').length);
      add('penalty_goals', goals.filter((g) => g.kind === 'penalty').length);
      add('own_goals', goals.filter((g) => g.kind === 'own_goal').length);
      add('assists', state.goals.filter((g) => g.assistId === participantId).length);
      add(
        'yellow_cards',
        state.cards.filter((c) => c.playerId === participantId && c.color === 'yellow').length,
      );
      add('red_cards', state.sentOff.includes(participantId) ? 1 : 0);
      add('appearances', state.appeared.includes(participantId) ? 1 : 0);
    }
  }
  return records;
}

export const footballEngine: SportEngine<FootballState, FootballSettings, FootballCommand> = {
  sport: 'football',
  version: 1,
  settingsSchema: footballSettingsSchema,
  commandSchema: footballCommandSchema,
  presets: footballPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: footballRuleCatalogue,
  ruleVariables: footballRuleVariables,
};
