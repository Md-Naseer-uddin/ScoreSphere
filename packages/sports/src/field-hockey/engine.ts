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
  periodClockRunning,
  periodElapsed,
  type Result,
  runPeriodClock,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { shootoutNext, shootoutTally, shootoutWinner } from '../shootout.js';
import { hockeyRuleCatalogue, hockeyRuleVariables } from './rules.js';
import { hockeyPresets, type HockeySettings, hockeySettingsSchema } from './settings.js';

/**
 * Field hockey, version 1, following the FIH Rules of Hockey where a setting doesn't say
 * otherwise. Substitutes roll without limit, so the scorer doesn't track who is on the
 * pitch; green and yellow cards suspend a player for minutes of playing time.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const HOCKEY_GOAL_KINDS = ['field_goal', 'penalty_corner', 'penalty_stroke'] as const;
export type HockeyGoalKind = (typeof HOCKEY_GOAL_KINDS)[number];
export const HOCKEY_CARDS = ['green', 'yellow', 'red'] as const;
export type HockeyCard = (typeof HOCKEY_CARDS)[number];

export const hockeyCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_period') }),
  z.object({ type: z.literal('end_period') }),
  /** Umpires stop and restart time; restarts also follow a goal or a penalty corner. */
  z.object({ type: z.literal('stop_clock') }),
  z.object({ type: z.literal('restart_clock') }),
  /** A goal from open play or a penalty corner; strokes are recorded with `penalty_stroke`. */
  z.object({
    type: z.literal('goal'),
    side: sideSchema,
    kind: z.enum(['field_goal', 'penalty_corner']),
    scorerId: idSchema.optional(),
    assistId: idSchema.optional(),
  }),
  z.object({ type: z.literal('penalty_corner'), side: sideSchema }),
  z.object({
    type: z.literal('penalty_stroke'),
    side: sideSchema,
    scored: z.boolean(),
    takerId: idSchema.optional(),
  }),
  /** `minutes` overrides the suspension for a yellow card (e.g. 10 for a more serious offence). */
  z.object({
    type: z.literal('card'),
    side: sideSchema,
    playerId: idSchema,
    color: z.enum(HOCKEY_CARDS),
    minutes: z.int().min(1).max(20).optional(),
  }),
  z.object({ type: z.literal('start_shootout'), firstSide: sideSchema }),
  z.object({
    type: z.literal('shootout_attempt'),
    side: sideSchema,
    scored: z.boolean(),
    playerId: idSchema.optional(),
  }),
  /** Ends the match now on the current score, e.g. from a mercy rule. */
  z.object({ type: z.literal('final_whistle') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
]);
export type HockeyCommand = z.infer<typeof hockeyCommandSchema>;

interface When {
  period: number;
  minute: number;
  added: number;
}

export interface HockeyGoalRecord extends When {
  side: Side;
  kind: HockeyGoalKind;
  scorerId: string | null;
  assistId: string | null;
}

export interface HockeyCardRecord extends When {
  side: Side;
  playerId: string;
  color: HockeyCard;
  /** Suspension length; 0 for a red card, which is permanent. */
  minutes: number;
  /** Playing time when the card was shown. */
  atPlayedMs: number;
}

export interface HockeyState {
  config: HockeySettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'shootout' | 'complete';
  periods: PeriodClock;
  /** Playing time of the periods already finished. */
  playedBeforeMs: number;
  score: [number, number];
  goals: HockeyGoalRecord[];
  penaltyCorners: [number, number];
  strokes: (When & { side: Side; takerId: string | null; scored: boolean })[];
  cards: HockeyCardRecord[];
  /** Red-carded players, out for the rest of the match. */
  excluded: string[];
  shootout: {
    firstSide: Side;
    attempts: { side: Side; playerId: string | null; scored: boolean }[];
  } | null;
  outcome: { winner: Side | null; finish: 'regular' | 'shootout' | 'forfeit' | 'walkover' } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

/** Playing time so far: finished periods plus the clock of the current one. */
export function hockeyPlayedMs(state: HockeyState, now: number): number {
  return state.playedBeforeMs + (state.periods.ended ? 0 : periodElapsed(state.periods, now));
}

/** Players serving a green or yellow card at `now`, with the playing time they have left. */
export function hockeySuspensions(
  state: HockeyState,
  now: number,
): { side: Side; playerId: string; color: HockeyCard; remainingMs: number }[] {
  if (state.phase === 'complete') return [];
  const played = hockeyPlayedMs(state, now);
  return state.cards
    .filter((c) => c.color !== 'red')
    .map((c) => ({
      side: c.side,
      playerId: c.playerId,
      color: c.color,
      remainingMs: c.atPlayedMs + c.minutes * 60_000 - played,
    }))
    .filter((s) => s.remainingMs > 0);
}

export function hockeyMinute(state: HockeyState, now: number) {
  const { periodMinutes } = state.config;
  const n = Math.max(1, state.periods.number);
  return matchMinute((n - 1) * periodMinutes, periodMinutes, periodElapsed(state.periods, now));
}

export function hockeyShootoutScore(state: HockeyState) {
  return shootoutTally(state.shootout?.attempts ?? []);
}

export function hockeyNextShooter(state: HockeyState): Side | null {
  return state.shootout
    ? shootoutNext(state.shootout.firstSide, state.shootout.attempts.length)
    : null;
}

function init(config: HockeySettings, roster: MatchRoster): HockeyState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    periods: newPeriodClock(),
    playedBeforeMs: 0,
    score: [0, 0],
    goals: [],
    penaltyCorners: [0, 0],
    strokes: [],
    cards: [],
    excluded: [],
    shootout: null,
    outcome: null,
  };
}

function validateSetup(_config: HockeySettings, roster: MatchRoster): Result<void, EngineError> {
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

function validate(state: HockeyState, cmd: HockeyCommand): Result<void, EngineError> {
  /** A player of `side` who has not been sent off; absent means not recorded. */
  const eligible = (side: Side, id: string | undefined) =>
    id === undefined || (state.players[side].includes(id) && !state.excluded.includes(id));
  const playing = state.phase === 'playing';
  switch (cmd.type) {
    case 'start_period':
      return state.phase === 'pre_match' || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'A period is already being played.');
    case 'end_period':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No period is being played.');
    case 'stop_clock':
      return playing && periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is not running.');
    case 'restart_clock':
      return playing && !periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is already running.');
    case 'goal':
      if (!playing) return fail('NOT_NOW', 'Goals are scored while a period is played.');
      if (!eligible(cmd.side, cmd.scorerId) || !eligible(cmd.side, cmd.assistId)) {
        return fail(
          'NOT_ELIGIBLE',
          'Scorer and assist must be players of that team still in the match.',
        );
      }
      return cmd.assistId !== undefined && cmd.assistId === cmd.scorerId
        ? fail('BAD_ASSIST', 'A player can’t assist their own goal.')
        : ok(undefined);
    case 'penalty_corner':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No period is being played.');
    case 'penalty_stroke':
      if (!playing) return fail('NOT_NOW', 'No period is being played.');
      return eligible(cmd.side, cmd.takerId)
        ? ok(undefined)
        : fail('NOT_ELIGIBLE', 'The taker must be a player of that team still in the match.');
    case 'card':
      if (state.phase === 'complete') return fail('MATCH_OVER', 'The match is over.');
      if (!state.players[cmd.side].includes(cmd.playerId)) {
        return fail('NOT_IN_TEAM', 'That player is not in the team.');
      }
      if (state.excluded.includes(cmd.playerId)) {
        return fail('SENT_OFF', 'That player has already been sent off.');
      }
      return cmd.minutes !== undefined && cmd.color !== 'yellow'
        ? fail('BAD_MINUTES', 'Only a yellow card’s suspension can be changed.')
        : ok(undefined);
    case 'start_shootout':
      return state.phase === 'shootout' && !state.shootout
        ? ok(undefined)
        : fail('NOT_NOW', 'There is no shoot-out to start.');
    case 'shootout_attempt':
      if (state.phase !== 'shootout' || !state.shootout) {
        return fail('NOT_NOW', 'The shoot-out has not started.');
      }
      if (cmd.side !== hockeyNextShooter(state)) {
        return fail('NOT_YOUR_TURN', 'The other team goes next.');
      }
      return eligible(cmd.side, cmd.playerId)
        ? ok(undefined)
        : fail('NOT_ELIGIBLE', 'The player must be in the team and not sent off.');
    case 'final_whistle':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

function stamp(state: HockeyState, at: number): When {
  return { period: state.periods.number, ...hockeyMinute(state, at) };
}

/** The result once time is up: a winner, a shoot-out or a draw. */
function afterTime(state: HockeyState, facts: DomainFact[]): HockeyState {
  const [a, b] = state.score;
  if (a !== b) {
    const winner: Side = a > b ? 0 : 1;
    facts.push({ type: 'match_won', data: { side: winner, finish: 'regular' } });
    return { ...state, phase: 'complete', outcome: { winner, finish: 'regular' } };
  }
  if (state.config.shootout) {
    facts.push({ type: 'shootout_needed' });
    return { ...state, phase: 'shootout' };
  }
  facts.push({ type: 'match_drawn' });
  return { ...state, phase: 'complete', outcome: { winner: null, finish: 'regular' } };
}

/** Ends the current period, banking its playing time. */
function closePeriod(state: HockeyState, at: number): HockeyState {
  if (state.periods.ended) return state;
  const periods = endPeriod(state.periods, at);
  return { ...state, periods, playedBeforeMs: state.playedBeforeMs + periods.clock.elapsedMs };
}

function apply(
  state: HockeyState,
  cmd: HockeyCommand,
  ctx: ApplyContext,
): { state: HockeyState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  const stop = (s: HockeyState) =>
    s.config.stopClock ? { ...s, periods: holdPeriodClock(s.periods, at) } : s;
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
      const n = state.periods.number;
      const next = closePeriod(state, at);
      const facts: DomainFact[] = [
        { type: 'period_ended', data: { period: n, periods: state.config.periods } },
      ];
      if (n < state.config.periods) return { state: { ...next, phase: 'break' }, facts };
      return { state: afterTime(next, facts), facts };
    }
    case 'stop_clock':
      return { state: { ...state, periods: holdPeriodClock(state.periods, at) }, facts: [] };
    case 'restart_clock':
      return { state: { ...state, periods: runPeriodClock(state.periods, at) }, facts: [] };
    case 'goal':
    case 'penalty_stroke': {
      const scored = cmd.type === 'goal' || cmd.scored;
      const when = stamp(state, at);
      let next: HockeyState = state;
      const facts: DomainFact[] = [];
      if (cmd.type === 'penalty_stroke') {
        next = {
          ...next,
          strokes: [
            ...next.strokes,
            { side: cmd.side, takerId: cmd.takerId ?? null, scored: cmd.scored, ...when },
          ],
        };
        facts.push({ type: 'penalty_stroke', data: { side: cmd.side, scored: cmd.scored } });
      }
      if (scored) {
        const kind: HockeyGoalKind = cmd.type === 'goal' ? cmd.kind : 'penalty_stroke';
        const score: [number, number] = [...next.score];
        score[cmd.side] += 1;
        const goal: HockeyGoalRecord = {
          side: cmd.side,
          kind,
          scorerId: (cmd.type === 'goal' ? cmd.scorerId : cmd.takerId) ?? null,
          assistId: cmd.type === 'goal' ? (cmd.assistId ?? null) : null,
          ...when,
        };
        // The clock stops until the centre pass restarts play.
        next = stop({ ...next, score, goals: [...next.goals, goal] });
        facts.push({ type: 'goal', data: { side: cmd.side, kind, minute: when.minute } });
      }
      return { state: next, facts };
    }
    case 'penalty_corner': {
      const corners: [number, number] = [...state.penaltyCorners];
      corners[cmd.side] += 1;
      return {
        state: stop({ ...state, penaltyCorners: corners }),
        facts: [{ type: 'penalty_corner', data: { side: cmd.side } }],
      };
    }
    case 'card': {
      const { config } = state;
      const minutes =
        cmd.color === 'green'
          ? config.greenCardMinutes
          : cmd.color === 'yellow'
            ? (cmd.minutes ?? config.yellowCardMinutes)
            : 0;
      const when = state.periods.number > 0 ? stamp(state, at) : { period: 0, minute: 0, added: 0 };
      const card: HockeyCardRecord = {
        side: cmd.side,
        playerId: cmd.playerId,
        color: cmd.color,
        minutes,
        atPlayedMs: hockeyPlayedMs(state, at),
        ...when,
      };
      const facts: DomainFact[] = [{ type: 'card', data: { side: cmd.side, color: cmd.color } }];
      if (cmd.color === 'red') facts.push({ type: 'sent_off', data: { side: cmd.side } });
      return {
        state: {
          ...state,
          cards: [...state.cards, card],
          excluded: cmd.color === 'red' ? [...state.excluded, cmd.playerId] : state.excluded,
        },
        facts,
      };
    }
    case 'start_shootout':
      return {
        state: { ...state, shootout: { firstSide: cmd.firstSide, attempts: [] } },
        facts: [{ type: 'shootout_started', data: { firstSide: cmd.firstSide } }],
      };
    case 'shootout_attempt': {
      const attempts = [
        ...state.shootout!.attempts,
        { side: cmd.side, playerId: cmd.playerId ?? null, scored: cmd.scored },
      ];
      let next: HockeyState = { ...state, shootout: { ...state.shootout!, attempts } };
      const facts: DomainFact[] = [
        { type: 'shootout_attempt', data: { side: cmd.side, scored: cmd.scored } },
      ];
      const winner = shootoutWinner(state.config.shootout!.attempts, attempts);
      if (winner !== null) {
        next = { ...next, phase: 'complete', outcome: { winner, finish: 'shootout' } };
        facts.push({ type: 'match_won', data: { side: winner, finish: 'shootout' } });
      }
      return { state: next, facts };
    }
    case 'final_whistle': {
      const facts: DomainFact[] = [];
      return { state: afterTime(closePeriod(state, at), facts), facts };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...closePeriod(state, at),
          phase: 'complete',
          outcome: { winner, finish: cmd.reason },
        },
        facts: [{ type: 'match_won', data: { side: winner, finish: cmd.reason } }],
      };
    }
  }
}

/** Pausing the match stops the clock; resuming restarts it (ADR 0006). */
function onLifecycle(state: HockeyState, action: string, ctx: ApplyContext): HockeyState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  if (action === 'RESUME') {
    return { ...state, periods: runPeriodClock(state.periods, ctx.occurredAt) };
  }
  return state;
}

function commands(state: HockeyState): CommandDescriptor[] {
  const running = periodClockRunning(state.periods);
  const list: Record<HockeyState['phase'], HockeyCommand['type'][]> = {
    pre_match: ['start_period', 'card', 'concede'],
    playing: [
      'goal',
      'penalty_corner',
      'penalty_stroke',
      'card',
      running ? 'stop_clock' : 'restart_clock',
      'end_period',
      'concede',
    ],
    break: ['start_period', 'card', 'concede'],
    shootout: state.shootout ? ['shootout_attempt', 'concede'] : ['start_shootout', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

/** "2–1", with the shoot-out score when it decided the match. */
export function hockeyScoreLine(state: HockeyState): string {
  const line = `${state.score[0]}–${state.score[1]}`;
  if (state.shootout && state.shootout.attempts.length > 0) {
    const { goals } = hockeyShootoutScore(state);
    return `${line} (${goals[0]}–${goals[1]} SO)`;
  }
  return line;
}

function result(state: HockeyState): MatchResult {
  const summary = hockeyScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary };
  const { winner, finish } = state.outcome;
  if (winner === null) return { status: 'drawn', summary };
  const label = finish === 'forfeit' || finish === 'walkover' ? ` (${finish})` : '';
  return { status: 'won', winnerSide: winner, summary: `${summary}${label}` };
}

function stats(state: HockeyState): MetricRecord[] {
  const cards = (color: HockeyCard, match: (c: HockeyCardRecord) => boolean) =>
    state.cards.filter((c) => c.color === color && match(c)).length;
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => [
    { metric: 'goals_for', value: state.score[side], side },
    { metric: 'goals_against', value: state.score[other(side)], side },
    { metric: 'penalty_corners', value: state.penaltyCorners[side], side },
    { metric: 'green_cards', value: cards('green', (c) => c.side === side), side },
    { metric: 'yellow_cards', value: cards('yellow', (c) => c.side === side), side },
    { metric: 'red_cards', value: cards('red', (c) => c.side === side), side },
  ]);
  for (const side of [0, 1] as const) {
    for (const participantId of state.players[side]) {
      const goals = state.goals.filter((g) => g.scorerId === participantId);
      const add = (metric: string, value: number) =>
        records.push({ metric, value, side, participantId });
      add('goals', goals.length);
      add('field_goals', goals.filter((g) => g.kind === 'field_goal').length);
      add('penalty_corner_goals', goals.filter((g) => g.kind === 'penalty_corner').length);
      add('penalty_stroke_goals', goals.filter((g) => g.kind === 'penalty_stroke').length);
      add('assists', state.goals.filter((g) => g.assistId === participantId).length);
      for (const color of HOCKEY_CARDS) {
        add(
          `${color}_cards`,
          cards(color, (c) => c.playerId === participantId),
        );
      }
      // Substitutes roll without limit, so everyone named in the team counts as appearing.
      add('appearances', 1);
    }
  }
  return records;
}

export const hockeyEngine: SportEngine<HockeyState, HockeySettings, HockeyCommand> = {
  sport: 'field-hockey',
  version: 1,
  settingsSchema: hockeySettingsSchema,
  commandSchema: hockeyCommandSchema,
  presets: hockeyPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: hockeyRuleCatalogue,
  ruleVariables: hockeyRuleVariables,
};
