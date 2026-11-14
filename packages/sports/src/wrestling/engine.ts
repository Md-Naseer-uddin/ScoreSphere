import type { MatchResult, MatchRoster } from '@scoresphere/contracts';
import {
  type ApplyContext,
  beginPeriod,
  type CommandDescriptor,
  type DomainFact,
  endPeriod,
  type EngineError,
  err,
  holdPeriodClock,
  type MetricRecord,
  newPeriodClock,
  ok,
  type PeriodClock,
  periodClockRunning,
  periodElapsed,
  type Result,
  runPeriodClock,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { wrestlingRuleCatalogue, wrestlingRuleVariables } from './rules.js';
import { wrestlingPresets, type WrestlingSettings, wrestlingSettingsSchema } from './settings.js';

/**
 * Wrestling, version 1, following the UWW International Wrestling Rules where a setting
 * doesn't say otherwise. One wrestler a side. The bout ends at once on a fall or on
 * technical superiority; otherwise the higher score wins, with the criteria for level bouts.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);
const valueSchema = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(5)]);

export const ACTION_KINDS = [
  'takedown',
  'exposure',
  'reversal',
  'step_out',
  'throw',
  'passivity',
  'other',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const BOUT_ENDINGS = ['injury', 'forfeit', 'disqualification'] as const;

export const wrestlingCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_period') }),
  z.object({ type: z.literal('end_period') }),
  z.object({ type: z.literal('start_clock') }),
  z.object({ type: z.literal('stop_clock') }),
  /** Technical points for `side` from one action. */
  z.object({
    type: z.literal('points'),
    side: sideSchema,
    value: valueSchema,
    kind: z.enum(ACTION_KINDS).optional(),
  }),
  /** A caution to `side`; the opponent gets 1 or 2 points. */
  z.object({
    type: z.literal('caution'),
    side: sideSchema,
    penalty: z.union([z.literal(1), z.literal(2)]),
  }),
  /** A fall: `side` pins the opponent and wins. */
  z.object({ type: z.literal('fall'), side: sideSchema }),
  /** Ends the bout now, e.g. from a custom rule. */
  z.object({ type: z.literal('final_whistle') }),
  /** `side` loses by injury, forfeit or disqualification. */
  z.object({ type: z.literal('concede'), side: sideSchema, reason: z.enum(BOUT_ENDINGS) }),
]);
export type WrestlingCommand = z.infer<typeof wrestlingCommandSchema>;

export type WinMethod =
  | 'fall'
  | 'technical_superiority'
  | 'points'
  | 'criteria'
  | 'cautions'
  | (typeof BOUT_ENDINGS)[number];

export interface WrestlingAction {
  side: Side;
  value: number;
  kind: ActionKind | 'caution';
  period: number;
}

export interface WrestlingState {
  config: WrestlingSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'complete';
  periods: PeriodClock;
  score: [number, number];
  /** Every scoring action in order, cautions' penalty points included. */
  actions: WrestlingAction[];
  cautions: [number, number];
  outcome: { winner: Side | null; method: WinMethod } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export function wrestlingClockLeft(state: WrestlingState, now: number): number {
  return Math.max(0, state.config.periodMinutes * 60_000 - periodElapsed(state.periods, now));
}

/**
 * The winner of a level bout by the criteria (UWW): the highest-value action, then fewer
 * cautions, then the last point scored. Null when nothing separates them.
 */
export function criteriaWinner(state: WrestlingState): Side | null {
  const best = (side: Side) =>
    Math.max(
      0,
      ...state.actions.filter((a) => a.side === side && a.kind !== 'caution').map((a) => a.value),
    );
  if (best(0) !== best(1)) return best(0) > best(1) ? 0 : 1;
  if (state.cautions[0] !== state.cautions[1]) return state.cautions[0] < state.cautions[1] ? 0 : 1;
  return state.actions.at(-1)?.side ?? null;
}

/** UWW classification points for the winner and loser of a finished bout. */
export function classificationPoints(state: WrestlingState): [number, number] | null {
  const o = state.outcome;
  if (!o || o.winner === null) return null;
  const loser = other(o.winner);
  const loserScored = state.score[loser] > 0;
  const points: [number, number] = [0, 0];
  switch (o.method) {
    case 'technical_superiority':
      points[o.winner] = 4;
      points[loser] = loserScored ? 1 : 0;
      break;
    case 'points':
    case 'criteria':
      points[o.winner] = 3;
      points[loser] = loserScored ? 1 : 0;
      break;
    default:
      // Fall, injury, forfeit and disqualification: 5 to 0.
      points[o.winner] = 5;
  }
  return points;
}

function init(config: WrestlingSettings, roster: MatchRoster): WrestlingState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    periods: newPeriodClock(),
    score: [0, 0],
    actions: [],
    cautions: [0, 0],
    outcome: null,
  };
}

function validateSetup(_config: WrestlingSettings, roster: MatchRoster): Result<void, EngineError> {
  return roster.sides.every((s) => s.participantIds.length === 1)
    ? ok(undefined)
    : fail('SIDE_SIZE', 'A bout is between two wrestlers.');
}

function validate(state: WrestlingState, cmd: WrestlingCommand): Result<void, EngineError> {
  const playing = state.phase === 'playing';
  switch (cmd.type) {
    case 'start_period':
      return state.phase === 'pre_match' || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'A period is already being wrestled.');
    case 'end_period':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No period is being wrestled.');
    case 'start_clock':
      return playing && !periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is already running.');
    case 'stop_clock':
      return playing && periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is not running.');
    case 'points':
    case 'caution':
    case 'fall':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No period is being wrestled.');
    case 'final_whistle':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The bout is not being wrestled.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The bout is over.') : ok(undefined);
  }
}

function complete(
  state: WrestlingState,
  at: number,
  winner: Side | null,
  method: WinMethod,
  facts: DomainFact[],
): WrestlingState {
  facts.push(
    winner === null
      ? { type: 'bout_undecided' }
      : { type: 'match_won', data: { side: winner, method } },
  );
  return {
    ...state,
    periods: state.periods.ended ? state.periods : endPeriod(state.periods, at),
    phase: 'complete',
    outcome: { winner, method },
  };
}

/** Ends the bout on technical superiority once the lead is big enough. */
function checkSuperiority(state: WrestlingState, at: number, facts: DomainFact[]): WrestlingState {
  const ts = state.config.technicalSuperiority;
  const lead = state.score[0] - state.score[1];
  if (ts === null || Math.abs(lead) < ts) return state;
  return complete(state, at, lead > 0 ? 0 : 1, 'technical_superiority', facts);
}

/** The result when time is up: points, else the criteria for a level bout. */
function onPointsOrCriteria(
  state: WrestlingState,
  at: number,
  facts: DomainFact[],
): WrestlingState {
  const [a, b] = state.score;
  if (a !== b) return complete(state, at, a > b ? 0 : 1, 'points', facts);
  return complete(state, at, criteriaWinner(state), 'criteria', facts);
}

function apply(
  state: WrestlingState,
  cmd: WrestlingCommand,
  ctx: ApplyContext,
): { state: WrestlingState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  const period = state.periods.number;
  const facts: DomainFact[] = [];
  switch (cmd.type) {
    case 'start_period': {
      const periods = beginPeriod(state.periods, at);
      return {
        state: { ...state, phase: 'playing', periods },
        facts: [
          {
            type: 'period_started',
            data: { period: periods.number, periods: state.config.periods },
          },
        ],
      };
    }
    case 'end_period': {
      const next = { ...state, periods: endPeriod(state.periods, at) };
      facts.push({ type: 'period_ended', data: { period, periods: state.config.periods } });
      if (period < state.config.periods) return { state: { ...next, phase: 'break' }, facts };
      return { state: onPointsOrCriteria(next, at, facts), facts };
    }
    case 'start_clock':
      return { state: { ...state, periods: runPeriodClock(state.periods, at) }, facts };
    case 'stop_clock':
      return { state: { ...state, periods: holdPeriodClock(state.periods, at) }, facts };
    case 'points': {
      const score: [number, number] = [...state.score];
      score[cmd.side] += cmd.value;
      facts.push({ type: 'points', data: { side: cmd.side, value: cmd.value } });
      const next: WrestlingState = {
        ...state,
        score,
        actions: [
          ...state.actions,
          { side: cmd.side, value: cmd.value, kind: cmd.kind ?? 'other', period },
        ],
      };
      return { state: checkSuperiority(next, at, facts), facts };
    }
    case 'caution': {
      const opponent = other(cmd.side);
      const cautions: [number, number] = [...state.cautions];
      cautions[cmd.side] += 1;
      const score: [number, number] = [...state.score];
      score[opponent] += cmd.penalty;
      facts.push({ type: 'caution', data: { side: cmd.side, count: cautions[cmd.side] } });
      let next: WrestlingState = {
        ...state,
        cautions,
        score,
        actions: [
          ...state.actions,
          { side: opponent, value: cmd.penalty, kind: 'caution', period },
        ],
      };
      if (cautions[cmd.side] >= state.config.cautionsToDisqualify) {
        next = complete(next, at, opponent, 'cautions', facts);
        return { state: next, facts };
      }
      return { state: checkSuperiority(next, at, facts), facts };
    }
    case 'fall':
      return { state: complete(state, at, cmd.side, 'fall', facts), facts };
    case 'final_whistle':
      return { state: onPointsOrCriteria(state, at, facts), facts };
    case 'concede':
      return { state: complete(state, at, other(cmd.side), cmd.reason, facts), facts };
  }
}

/** Pausing the bout stops the clock (ADR 0006); the scorer restarts it with the referee. */
function onLifecycle(state: WrestlingState, action: string, ctx: ApplyContext): WrestlingState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  return state;
}

function commands(state: WrestlingState): CommandDescriptor[] {
  const list: Record<WrestlingState['phase'], WrestlingCommand['type'][]> = {
    pre_match: ['start_period', 'concede'],
    playing: [
      'points',
      'caution',
      'fall',
      periodClockRunning(state.periods) ? 'stop_clock' : 'start_clock',
      'end_period',
      'concede',
    ],
    break: ['start_period', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

const METHOD_LABEL: Record<WinMethod, string> = {
  fall: 'fall',
  technical_superiority: 'technical superiority',
  points: '',
  criteria: 'on criteria',
  cautions: 'three cautions',
  injury: 'injury',
  forfeit: 'forfeit',
  disqualification: 'disqualification',
};

function result(state: WrestlingState): MatchResult {
  const line = `${state.score[0]}–${state.score[1]}`;
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const { winner, method } = state.outcome;
  const label = METHOD_LABEL[method];
  const summary = label ? `${line} (${label})` : line;
  if (winner === null) return { status: 'no_result', summary };
  return { status: 'won', winnerSide: winner, summary };
}

function stats(state: WrestlingState): MetricRecord[] {
  const classification = classificationPoints(state) ?? [0, 0];
  return ([0, 1] as const).flatMap((side) => {
    const participantId = state.players[side][0]!;
    const own = state.actions.filter((a) => a.side === side && a.kind !== 'caution');
    return [
      { metric: 'technical_points', value: state.score[side], side, participantId },
      { metric: 'cautions', value: state.cautions[side], side, participantId },
      {
        metric: 'highest_action',
        value: Math.max(0, ...own.map((a) => a.value)),
        side,
        participantId,
      },
      { metric: 'classification_points', value: classification[side], side, participantId },
      {
        metric: 'wins_by_fall',
        value: state.outcome?.winner === side && state.outcome.method === 'fall' ? 1 : 0,
        side,
        participantId,
      },
    ];
  });
}

export const wrestlingEngine: SportEngine<WrestlingState, WrestlingSettings, WrestlingCommand> = {
  sport: 'wrestling',
  version: 1,
  settingsSchema: wrestlingSettingsSchema,
  commandSchema: wrestlingCommandSchema,
  presets: wrestlingPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: wrestlingRuleCatalogue,
  ruleVariables: wrestlingRuleVariables,
};
