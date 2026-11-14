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
import { basketballRuleCatalogue, basketballRuleVariables } from './rules.js';
import {
  basketballPresets,
  type BasketballSettings,
  basketballSettingsSchema,
} from './settings.js';

/**
 * Basketball, version 1, following the FIBA Official Basketball Rules where a setting
 * doesn't say otherwise. The scorer runs the game clock as the table officials do, starting
 * and stopping it with play. Substitutions are unlimited, so who is on court isn't tracked.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);
const pointsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const FOUL_KINDS = ['personal', 'technical', 'unsportsmanlike', 'disqualifying'] as const;
export type FoulKind = (typeof FOUL_KINDS)[number];
export const PLAY_KINDS = ['rebound', 'steal', 'block', 'turnover'] as const;
export type PlayKind = (typeof PLAY_KINDS)[number];

export const basketballCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_period') }),
  z.object({ type: z.literal('end_period') }),
  z.object({ type: z.literal('start_clock') }),
  z.object({ type: z.literal('stop_clock') }),
  /** A made basket: 1 for a free throw, 2 or 3 for a field goal. */
  z.object({
    type: z.literal('score'),
    side: sideSchema,
    points: pointsSchema,
    playerId: idSchema.optional(),
    assistId: idSchema.optional(),
  }),
  /** A missed shot, for shooting percentages. Optional to record. */
  z.object({
    type: z.literal('miss'),
    side: sideSchema,
    points: pointsSchema,
    playerId: idSchema.optional(),
  }),
  /** A foul by a player of `side`; without a player it counts only as a team foul. */
  z.object({
    type: z.literal('foul'),
    side: sideSchema,
    kind: z.enum(FOUL_KINDS),
    playerId: idSchema.optional(),
  }),
  z.object({ type: z.literal('timeout'), side: sideSchema }),
  /** Rebounds, steals, blocks and turnovers, when the scorer tracks them. */
  z.object({
    type: z.literal('play'),
    side: sideSchema,
    kind: z.enum(PLAY_KINDS),
    playerId: idSchema,
  }),
  /** Ends the game now on the current score, e.g. from a mercy rule. */
  z.object({ type: z.literal('final_whistle') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
]);
export type BasketballCommand = z.infer<typeof basketballCommandSchema>;

export interface BasketRecord {
  side: Side;
  points: 1 | 2 | 3;
  playerId: string | null;
  assistId: string | null;
  period: number;
}

export interface BasketballState {
  config: BasketballSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'complete';
  periods: PeriodClock;
  score: [number, number];
  /** Points per period, regular and overtime. */
  periodScores: [number, number][];
  baskets: BasketRecord[];
  misses: { side: Side; points: 1 | 2 | 3; playerId: string | null }[];
  fouls: { side: Side; kind: FoulKind; playerId: string | null; period: number }[];
  /** Players out of the game: fouled out or disqualified. */
  disqualified: string[];
  timeouts: { side: Side; period: number }[];
  plays: { side: Side; kind: PlayKind; playerId: string }[];
  outcome: {
    winner: Side | null;
    finish: 'regular' | 'overtime' | 'forfeit' | 'walkover';
  } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export const isOvertime = (c: BasketballSettings, n: number) => n > c.periods;

/** Length of period `n` in ms. */
export const periodLengthMs = (c: BasketballSettings, n: number) =>
  (isOvertime(c, n) ? c.overtimeMinutes : c.periodMinutes) * 60_000;

/** Game-clock time left in the current period at `now`; 0 once it has run out. */
export function basketballClockLeft(state: BasketballState, now: number): number {
  const n = Math.max(1, state.periods.number);
  return Math.max(0, periodLengthMs(state.config, n) - periodElapsed(state.periods, now));
}

/**
 * Team fouls in the current period. Fouls in overtime count with the last regular period
 * (FIBA: extra periods are part of the fourth quarter).
 */
export function teamFouls(state: BasketballState, side: Side): number {
  const bucket = (n: number) => Math.min(n, state.config.periods);
  const current = bucket(Math.max(1, state.periods.number));
  return state.fouls.filter((f) => f.side === side && bucket(f.period) === current).length;
}

/** Whether `side`'s fouls now bring the penalty (two free throws for every foul). */
export function inPenalty(state: BasketballState, side: Side): boolean {
  const limit = state.config.teamFoulLimit;
  return limit !== null && teamFouls(state, side) >= limit;
}

/** Which allowance a timeout in period `n` comes from: a half, or one overtime period. */
function timeoutBucket(c: BasketballSettings, n: number): string {
  if (isOvertime(c, n)) return `ot${n}`;
  return c.periods === 1 || n <= Math.floor(c.periods / 2) ? 'h1' : 'h2';
}

/** Timeouts `side` has left at this point of the game. */
export function timeoutsLeft(state: BasketballState, side: Side): number {
  const c = state.config;
  const n = Math.max(1, state.periods.number);
  const bucket = timeoutBucket(c, n);
  const allowed = isOvertime(c, n)
    ? c.timeoutsPerOvertime
    : bucket === 'h1'
      ? c.timeoutsFirstHalf
      : c.timeoutsSecondHalf;
  const used = state.timeouts.filter(
    (t) => t.side === side && timeoutBucket(c, t.period) === bucket,
  ).length;
  return Math.max(0, allowed - used);
}

function init(config: BasketballSettings, roster: MatchRoster): BasketballState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    periods: newPeriodClock(),
    score: [0, 0],
    periodScores: [],
    baskets: [],
    misses: [],
    fouls: [],
    disqualified: [],
    timeouts: [],
    plays: [],
    outcome: null,
  };
}

function validateSetup(
  _config: BasketballSettings,
  roster: MatchRoster,
): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length < 1 || side.participantIds.length > 20) {
      return fail('SIDE_SIZE', 'Each team needs 1 to 20 players.');
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function validate(state: BasketballState, cmd: BasketballCommand): Result<void, EngineError> {
  const playing = state.phase === 'playing';
  /** A player of `side` still in the game; absent means not recorded. */
  const eligible = (side: Side, id: string | undefined) =>
    id === undefined || (state.players[side].includes(id) && !state.disqualified.includes(id));
  switch (cmd.type) {
    case 'start_period':
      return state.phase === 'pre_match' || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'A period is already being played.');
    case 'end_period':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No period is being played.');
    case 'start_clock':
      return playing && !periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is already running.');
    case 'stop_clock':
      return playing && periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is not running.');
    case 'score':
      if (!playing) return fail('NOT_NOW', 'Points are scored while a period is played.');
      if (!eligible(cmd.side, cmd.playerId) || !eligible(cmd.side, cmd.assistId)) {
        return fail('NOT_ELIGIBLE', 'Players must be in that team and still in the game.');
      }
      if (cmd.assistId !== undefined && (cmd.points === 1 || cmd.assistId === cmd.playerId)) {
        return fail('BAD_ASSIST', 'An assist is for a teammate’s field goal.');
      }
      return ok(undefined);
    case 'miss':
      if (!playing) return fail('NOT_NOW', 'No period is being played.');
      return eligible(cmd.side, cmd.playerId)
        ? ok(undefined)
        : fail('NOT_ELIGIBLE', 'The shooter must be in that team and still in the game.');
    case 'foul':
      if (state.phase === 'pre_match' || state.phase === 'complete') {
        return fail('NOT_NOW', 'Fouls are recorded during the game.');
      }
      return eligible(cmd.side, cmd.playerId)
        ? ok(undefined)
        : fail('NOT_ELIGIBLE', 'That player is not in the team or is already out of the game.');
    case 'timeout':
      if (!playing && state.phase !== 'break') return fail('NOT_NOW', 'The game is not on.');
      return timeoutsLeft(state, cmd.side) > 0
        ? ok(undefined)
        : fail('NO_TIMEOUTS', 'That team has no timeouts left for now.');
    case 'play':
      if (!playing) return fail('NOT_NOW', 'No period is being played.');
      return eligible(cmd.side, cmd.playerId)
        ? ok(undefined)
        : fail('NOT_ELIGIBLE', 'That player is not in the team or is out of the game.');
    case 'final_whistle':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The game is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The game is over.') : ok(undefined);
  }
}

/** Whether a player's fouls put them out of the game (FIBA Art. 36–38, 40). */
function outOfGame(state: BasketballState, playerId: string): boolean {
  const fouls = state.fouls.filter((f) => f.playerId === playerId);
  if (fouls.some((f) => f.kind === 'disqualifying')) return true;
  // Two technical or unsportsmanlike fouls, in any mix, disqualify a player.
  if (fouls.filter((f) => f.kind === 'technical' || f.kind === 'unsportsmanlike').length >= 2) {
    return true;
  }
  const limit = state.config.foulLimit;
  return limit !== null && fouls.length >= limit;
}

function finish(state: BasketballState, facts: DomainFact[]): BasketballState {
  const [a, b] = state.score;
  const finishKind = state.periods.number > state.config.periods ? 'overtime' : 'regular';
  if (a === b) {
    facts.push({ type: 'match_drawn' });
    return { ...state, phase: 'complete', outcome: { winner: null, finish: finishKind } };
  }
  const winner: Side = a > b ? 0 : 1;
  facts.push({ type: 'match_won', data: { side: winner, finish: finishKind } });
  return { ...state, phase: 'complete', outcome: { winner, finish: finishKind } };
}

function apply(
  state: BasketballState,
  cmd: BasketballCommand,
  ctx: ApplyContext,
): { state: BasketballState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  const n = state.periods.number;
  switch (cmd.type) {
    case 'start_period': {
      const periods = beginPeriod(state.periods, at);
      return {
        state: {
          ...state,
          phase: 'playing',
          periods,
          periodScores: [...state.periodScores, [0, 0]],
        },
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
      const facts: DomainFact[] = [
        { type: 'period_ended', data: { period: n, periods: state.config.periods } },
      ];
      if (n < state.config.periods) return { state: { ...next, phase: 'break' }, facts };
      if (state.score[0] === state.score[1]) {
        // No drawn games: overtime until there is a winner (FIBA Art. 8.7).
        facts.push({ type: 'overtime_needed' });
        return { state: { ...next, phase: 'break' }, facts };
      }
      return { state: finish(next, facts), facts };
    }
    case 'start_clock':
      return { state: { ...state, periods: runPeriodClock(state.periods, at) }, facts: [] };
    case 'stop_clock':
      return { state: { ...state, periods: holdPeriodClock(state.periods, at) }, facts: [] };
    case 'score': {
      const score: [number, number] = [...state.score];
      score[cmd.side] += cmd.points;
      const periodScores = state.periodScores.map((p, i) =>
        i === state.periodScores.length - 1
          ? ((cmd.side === 0 ? [p[0] + cmd.points, p[1]] : [p[0], p[1] + cmd.points]) as [
              number,
              number,
            ])
          : p,
      );
      return {
        state: {
          ...state,
          score,
          periodScores,
          baskets: [
            ...state.baskets,
            {
              side: cmd.side,
              points: cmd.points,
              playerId: cmd.playerId ?? null,
              assistId: cmd.assistId ?? null,
              period: n,
            },
          ],
        },
        facts: [{ type: 'basket', data: { side: cmd.side, points: cmd.points } }],
      };
    }
    case 'miss':
      return {
        state: {
          ...state,
          misses: [
            ...state.misses,
            { side: cmd.side, points: cmd.points, playerId: cmd.playerId ?? null },
          ],
        },
        facts: [],
      };
    case 'foul': {
      let next: BasketballState = {
        ...state,
        fouls: [
          ...state.fouls,
          {
            side: cmd.side,
            kind: cmd.kind,
            playerId: cmd.playerId ?? null,
            period: Math.max(1, n),
          },
        ],
      };
      const facts: DomainFact[] = [{ type: 'foul', data: { side: cmd.side, kind: cmd.kind } }];
      if (cmd.playerId && outOfGame(next, cmd.playerId)) {
        next = { ...next, disqualified: [...next.disqualified, cmd.playerId] };
        facts.push({ type: 'player_out', data: { side: cmd.side } });
      }
      const limit = state.config.teamFoulLimit;
      if (limit !== null && teamFouls(next, cmd.side) === limit) {
        facts.push({ type: 'team_penalty', data: { side: cmd.side } });
      }
      return { state: next, facts };
    }
    case 'timeout':
      return {
        state: {
          ...state,
          periods: holdPeriodClock(state.periods, at),
          timeouts: [...state.timeouts, { side: cmd.side, period: Math.max(1, n) }],
        },
        facts: [{ type: 'timeout', data: { side: cmd.side } }],
      };
    case 'play':
      return {
        state: {
          ...state,
          plays: [...state.plays, { side: cmd.side, kind: cmd.kind, playerId: cmd.playerId }],
        },
        facts: [],
      };
    case 'final_whistle': {
      const facts: DomainFact[] = [];
      const next = state.periods.ended
        ? state
        : { ...state, periods: endPeriod(state.periods, at) };
      return { state: finish(next, facts), facts };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...state,
          periods: holdPeriodClock(state.periods, at),
          phase: 'complete',
          outcome: { winner, finish: cmd.reason },
        },
        facts: [{ type: 'match_won', data: { side: winner, finish: cmd.reason } }],
      };
    }
  }
}

/** Pausing the game stops the clock (ADR 0006); the scorer restarts it with play. */
function onLifecycle(state: BasketballState, action: string, ctx: ApplyContext): BasketballState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  return state;
}

function commands(state: BasketballState): CommandDescriptor[] {
  const list: Record<BasketballState['phase'], BasketballCommand['type'][]> = {
    pre_match: ['start_period', 'concede'],
    playing: [
      periodClockRunning(state.periods) ? 'stop_clock' : 'start_clock',
      'score',
      'miss',
      'foul',
      'timeout',
      'play',
      'end_period',
      'concede',
    ],
    break: ['start_period', 'foul', 'timeout', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

/** "78–74", with "(OT)" or "(2OT)" when overtime was played. */
export function basketballScoreLine(state: BasketballState): string {
  const line = `${state.score[0]}–${state.score[1]}`;
  const overtimes = Math.max(0, state.periods.number - state.config.periods);
  if (overtimes === 0) return line;
  return `${line} (${overtimes > 1 ? overtimes : ''}OT)`;
}

function result(state: BasketballState): MatchResult {
  const summary = basketballScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary };
  const { winner, finish: how } = state.outcome;
  if (winner === null) return { status: 'drawn', summary };
  const label = how === 'forfeit' || how === 'walkover' ? ` (${how})` : '';
  return { status: 'won', winnerSide: winner, summary: `${summary}${label}` };
}

function stats(state: BasketballState): MetricRecord[] {
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => [
    { metric: 'points_for', value: state.score[side], side },
    { metric: 'points_against', value: state.score[other(side)], side },
    { metric: 'team_fouls', value: state.fouls.filter((f) => f.side === side).length, side },
    { metric: 'timeouts', value: state.timeouts.filter((t) => t.side === side).length, side },
  ]);
  for (const side of [0, 1] as const) {
    for (const participantId of state.players[side]) {
      const made = state.baskets.filter((b) => b.playerId === participantId);
      const missed = state.misses.filter((m) => m.playerId === participantId);
      const count = (rows: { points: number }[], points: number) =>
        rows.filter((r) => r.points === points).length;
      const plays = (kind: PlayKind) =>
        state.plays.filter((p) => p.playerId === participantId && p.kind === kind).length;
      const add = (metric: string, value: number) =>
        records.push({ metric, value, side, participantId });
      add(
        'points',
        made.reduce((n, b) => n + b.points, 0),
      );
      add('two_pointers', count(made, 2));
      add('three_pointers', count(made, 3));
      add('free_throws_made', count(made, 1));
      add('free_throws_attempted', count(made, 1) + count(missed, 1));
      add(
        'field_goals_attempted',
        count(made, 2) + count(made, 3) + count(missed, 2) + count(missed, 3),
      );
      add('assists', state.baskets.filter((b) => b.assistId === participantId).length);
      add('rebounds', plays('rebound'));
      add('steals', plays('steal'));
      add('blocks', plays('block'));
      add('turnovers', plays('turnover'));
      add('fouls', state.fouls.filter((f) => f.playerId === participantId).length);
      add('missed_shots', missed.length);
      // Substitutions are unlimited, so everyone named in the team counts as appearing.
      add('appearances', 1);
    }
  }
  return records;
}

export const basketballEngine: SportEngine<BasketballState, BasketballSettings, BasketballCommand> =
  {
    sport: 'basketball',
    version: 1,
    settingsSchema: basketballSettingsSchema,
    commandSchema: basketballCommandSchema,
    presets: basketballPresets,
    validateSetup,
    init,
    commands,
    validate,
    apply,
    onLifecycle,
    isComplete: (state) => state.phase === 'complete',
    result,
    stats,
    ruleCatalogue: basketballRuleCatalogue,
    ruleVariables: basketballRuleVariables,
  };
