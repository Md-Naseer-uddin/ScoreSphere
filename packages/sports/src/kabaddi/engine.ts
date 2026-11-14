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
import { kabaddiRuleCatalogue, kabaddiRuleVariables } from './rules.js';
import { kabaddiPresets, type KabaddiSettings, kabaddiSettingsSchema } from './settings.js';

/**
 * Kabaddi, version 1. A raid is recorded once it ends: the defenders the raider touched,
 * a bonus, and whether the raider got back, was tackled or went out. Players out, revivals
 * and all outs follow from that. The scoresheet tracks how many players each team has on
 * the mat; naming the raider, the defenders touched and the tackler is optional, for stats.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const RAID_RESULTS = ['safe', 'tackled', 'out'] as const;
export type RaidResult = (typeof RAID_RESULTS)[number];

export const kabaddiCommandSchema = z.discriminatedUnion('type', [
  /** Starts a half; the first needs the team that raids first (from the toss). */
  z.object({ type: z.literal('start_period'), firstRaid: sideSchema.optional() }),
  z.object({ type: z.literal('end_period') }),
  z.object({ type: z.literal('start_clock') }),
  z.object({ type: z.literal('stop_clock') }),
  z.object({
    type: z.literal('raid'),
    /** The raiding team. */
    side: sideSchema,
    raiderId: idSchema.optional(),
    /** Defenders the raider touched; they are out only when the raider gets back safely. */
    touches: z.int().min(0).max(7),
    touchedIds: z.array(idSchema).max(7).optional(),
    bonus: z.boolean(),
    /** Back safely, tackled by the defence, or out another way (time, boundary, cant). */
    result: z.enum(RAID_RESULTS),
    tacklerId: idSchema.optional(),
  }),
  /** A player out other than in a raid, e.g. a defender stepping out of bounds. */
  z.object({ type: z.literal('player_out'), side: sideSchema, playerId: idSchema.optional() }),
  /** Points given by the referee, e.g. for a technical foul by the other team. */
  z.object({ type: z.literal('technical'), side: sideSchema, points: z.int().min(1).max(3) }),
  z.object({ type: z.literal('timeout'), side: sideSchema }),
  /** Ends the match now on the current score, e.g. from a mercy rule. */
  z.object({ type: z.literal('final_whistle') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
]);
export type KabaddiCommand = z.infer<typeof kabaddiCommandSchema>;

export interface RaidRecord {
  side: Side;
  raiderId: string | null;
  touches: number;
  touchedIds: string[];
  bonus: boolean;
  result: RaidResult;
  tacklerId: string | null;
  doOrDie: boolean;
  superTackle: boolean;
  /** Points each team scored from the raid, all outs included. */
  points: [number, number];
  half: number;
}

export interface KabaddiState {
  config: KabaddiSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'complete';
  periods: PeriodClock;
  score: [number, number];
  /** Players on the mat, and out waiting to be revived. */
  onMat: [number, number];
  /** Full strength: the setting, or fewer if a team has fewer players. */
  strength: [number, number];
  /** Empty raids in a row, for do-or-die raids. */
  emptyRaids: [number, number];
  firstRaid: Side | null;
  /** Who raids next; teams take turns. */
  nextRaid: Side | null;
  raids: RaidRecord[];
  allOuts: [number, number];
  technicals: { side: Side; points: number }[];
  timeouts: { side: Side; half: number }[];
  outcome: { winner: Side | null; finish: 'played' | 'forfeit' | 'walkover' } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

/** Whether the next raid of `side` must score (two empty raids before it). */
export function isDoOrDie(state: KabaddiState, side: Side): boolean {
  return state.config.doOrDie && state.emptyRaids[side] >= 2;
}

/** Whether a raid into `defending` may score a bonus point now. */
export function bonusLive(state: KabaddiState, defending: Side): boolean {
  return state.config.bonusLine && state.onMat[defending] >= state.config.bonusMinDefenders;
}

export function kabaddiClockLeft(state: KabaddiState, now: number): number {
  return Math.max(0, state.config.halfMinutes * 60_000 - periodElapsed(state.periods, now));
}

export function kabaddiTimeoutsLeft(state: KabaddiState, side: Side): number {
  const half = Math.max(1, state.periods.number);
  const used = state.timeouts.filter((t) => t.side === side && t.half === half).length;
  return Math.max(0, state.config.timeoutsPerHalf - used);
}

function init(config: KabaddiSettings, roster: MatchRoster): KabaddiState {
  const players: [string[], string[]] = [
    roster.sides[0]!.participantIds,
    roster.sides[1]!.participantIds,
  ];
  const strength: [number, number] = [
    Math.min(config.playersOnMat, players[0].length),
    Math.min(config.playersOnMat, players[1].length),
  ];
  return {
    config,
    players,
    phase: 'pre_match',
    periods: newPeriodClock(),
    score: [0, 0],
    onMat: [...strength],
    strength,
    emptyRaids: [0, 0],
    firstRaid: null,
    nextRaid: null,
    raids: [],
    allOuts: [0, 0],
    technicals: [],
    timeouts: [],
    outcome: null,
  };
}

function validateSetup(_config: KabaddiSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length < 1 || side.participantIds.length > 15) {
      return fail('SIDE_SIZE', 'Each team needs 1 to 15 players.');
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function validate(state: KabaddiState, cmd: KabaddiCommand): Result<void, EngineError> {
  const playing = state.phase === 'playing';
  const inTeam = (side: Side, id: string | undefined) =>
    id === undefined || state.players[side].includes(id);
  switch (cmd.type) {
    case 'start_period':
      if (state.phase === 'pre_match') {
        return cmd.firstRaid === undefined
          ? fail('PICK_FIRST_RAID', 'Choose the team that raids first.')
          : ok(undefined);
      }
      if (state.phase !== 'break') return fail('NOT_NOW', 'A half is already being played.');
      return cmd.firstRaid === undefined
        ? ok(undefined)
        : fail('FIRST_RAID_SET', 'The other team raids first in the second half.');
    case 'end_period':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No half is being played.');
    case 'start_clock':
      return playing && !periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is already running.');
    case 'stop_clock':
      return playing && periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is not running.');
    case 'raid': {
      if (!playing) return fail('NOT_NOW', 'Raids happen while a half is played.');
      if (cmd.side !== state.nextRaid) return fail('NOT_YOUR_RAID', 'The other team raids now.');
      const defending = other(cmd.side);
      if (cmd.result !== 'safe' && cmd.touches > 0) {
        return fail('NO_TOUCHES', 'Touches count only when the raider gets back.');
      }
      if (cmd.touches > state.onMat[defending]) {
        return fail('TOO_MANY_TOUCHES', 'More touches than defenders on the mat.');
      }
      if (cmd.bonus && cmd.result === 'out') {
        return fail('NO_BONUS', 'A raider who goes out keeps no bonus.');
      }
      if (cmd.bonus && !bonusLive(state, defending)) {
        return fail('NO_BONUS', 'The bonus line doesn’t count with this few defenders.');
      }
      if (cmd.touchedIds && cmd.touchedIds.length !== cmd.touches) {
        return fail('TOUCHED_COUNT', 'Name every defender touched, or none.');
      }
      if (
        !inTeam(cmd.side, cmd.raiderId) ||
        !(cmd.touchedIds ?? []).every((id) => inTeam(defending, id)) ||
        new Set(cmd.touchedIds ?? []).size !== (cmd.touchedIds ?? []).length
      ) {
        return fail('NOT_IN_TEAM', 'Raider and defenders must be in their teams.');
      }
      if (
        cmd.tacklerId !== undefined &&
        (cmd.result !== 'tackled' || !inTeam(defending, cmd.tacklerId))
      ) {
        return fail('BAD_TACKLER', 'Only a tackle has a tackler, from the defending team.');
      }
      return ok(undefined);
    }
    case 'player_out':
      if (!playing) return fail('NOT_NOW', 'No half is being played.');
      if (state.onMat[cmd.side] === 0)
        return fail('NONE_ON_MAT', 'That team has nobody on the mat.');
      return inTeam(cmd.side, cmd.playerId)
        ? ok(undefined)
        : fail('NOT_IN_TEAM', 'That player is not in the team.');
    case 'technical':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No half is being played.');
    case 'timeout':
      if (!playing) return fail('NOT_NOW', 'No half is being played.');
      return kabaddiTimeoutsLeft(state, cmd.side) > 0
        ? ok(undefined)
        : fail('NO_TIMEOUTS', 'That team has no timeouts left this half.');
    case 'final_whistle':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

/**
 * Puts `count` players of `side` out and revives as many of the other team's out players.
 * When a team has nobody left, it is all out: the other team scores the all-out points and
 * the whole team comes back.
 */
function putOut(
  state: KabaddiState,
  side: Side,
  count: number,
  points: [number, number],
  facts: DomainFact[],
): KabaddiState {
  if (count === 0) return state;
  const scorer = other(side);
  const onMat: [number, number] = [...state.onMat];
  onMat[side] -= count;
  onMat[scorer] = Math.min(state.strength[scorer], onMat[scorer] + count);
  let next: KabaddiState = { ...state, onMat };
  if (onMat[side] <= 0) {
    points[scorer] += state.config.allOutPoints;
    onMat[side] = state.strength[side];
    const allOuts: [number, number] = [...state.allOuts];
    allOuts[scorer] += 1;
    next = { ...next, onMat, allOuts };
    facts.push({ type: 'all_out', data: { side: scorer } });
  }
  return next;
}

function addPoints(state: KabaddiState, points: [number, number]): KabaddiState {
  return { ...state, score: [state.score[0] + points[0], state.score[1] + points[1]] };
}

function finish(state: KabaddiState, facts: DomainFact[]): KabaddiState {
  const [a, b] = state.score;
  if (a === b) {
    facts.push({ type: 'match_drawn' });
    return { ...state, phase: 'complete', outcome: { winner: null, finish: 'played' } };
  }
  const winner: Side = a > b ? 0 : 1;
  facts.push({ type: 'match_won', data: { side: winner, finish: 'played' } });
  return { ...state, phase: 'complete', outcome: { winner, finish: 'played' } };
}

function apply(
  state: KabaddiState,
  cmd: KabaddiCommand,
  ctx: ApplyContext,
): { state: KabaddiState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  const half = state.periods.number;
  switch (cmd.type) {
    case 'start_period': {
      const periods = beginPeriod(state.periods, at);
      const firstRaid = cmd.firstRaid ?? state.firstRaid!;
      // Teams take turns to raid first in each half.
      const nextRaid = cmd.firstRaid ?? other(state.firstRaid!);
      return {
        state: { ...state, phase: 'playing', periods, firstRaid, nextRaid },
        facts: [
          {
            type: 'period_started',
            data: { period: periods.number, periods: state.config.halves },
          },
        ],
      };
    }
    case 'end_period': {
      const next = { ...state, periods: endPeriod(state.periods, at) };
      const facts: DomainFact[] = [
        { type: 'period_ended', data: { period: half, periods: state.config.halves } },
      ];
      if (half < state.config.halves) return { state: { ...next, phase: 'break' }, facts };
      return { state: finish(next, facts), facts };
    }
    case 'start_clock':
      return { state: { ...state, periods: runPeriodClock(state.periods, at) }, facts: [] };
    case 'stop_clock':
      return { state: { ...state, periods: holdPeriodClock(state.periods, at) }, facts: [] };
    case 'raid': {
      const raiding = cmd.side;
      const defending = other(raiding);
      const doOrDie = isDoOrDie(state, raiding);
      const defenders = state.onMat[defending];
      const points: [number, number] = [0, 0];
      const facts: DomainFact[] = [];
      let next: KabaddiState = state;
      let result: RaidResult = cmd.result;
      if (cmd.bonus) points[raiding] += 1;
      const scoredInRaid = cmd.result === 'safe' && (cmd.touches > 0 || cmd.bonus);
      // An empty do-or-die raid puts the raider out.
      if (doOrDie && cmd.result === 'safe' && !scoredInRaid) result = 'out';
      const superTackle =
        result === 'tackled' &&
        state.config.superTackleMaxDefenders !== null &&
        defenders <= state.config.superTackleMaxDefenders;
      if (result === 'safe') {
        points[raiding] += cmd.touches;
        next = putOut(next, defending, cmd.touches, points, facts);
      } else {
        points[defending] += superTackle ? 2 : 1;
        next = putOut(next, raiding, 1, points, facts);
        facts.push({
          type: 'tackle',
          data: { side: defending, super: superTackle, tackled: result === 'tackled' },
        });
      }
      const emptyRaids: [number, number] = [...next.emptyRaids];
      emptyRaids[raiding] = result === 'safe' && !scoredInRaid ? emptyRaids[raiding] + 1 : 0;
      const raid: RaidRecord = {
        side: raiding,
        raiderId: cmd.raiderId ?? null,
        touches: result === 'safe' ? cmd.touches : 0,
        touchedIds: cmd.touchedIds ?? [],
        bonus: cmd.bonus,
        result,
        tacklerId: cmd.tacklerId ?? null,
        doOrDie,
        superTackle,
        points,
        half,
      };
      facts.unshift({
        type: 'raid',
        data: {
          side: raiding,
          points: points[raiding],
          tackled: result !== 'safe',
          doOrDie,
          // Three or more points by the raider: a super raid.
          superRaid: result === 'safe' && cmd.touches + (cmd.bonus ? 1 : 0) >= 3,
        },
      });
      next = addPoints(
        { ...next, emptyRaids, nextRaid: defending, raids: [...next.raids, raid] },
        points,
      );
      return { state: next, facts };
    }
    case 'player_out': {
      const points: [number, number] = [0, 0];
      points[other(cmd.side)] += 1;
      const facts: DomainFact[] = [{ type: 'player_out', data: { side: cmd.side } }];
      const next = putOut(state, cmd.side, 1, points, facts);
      return { state: addPoints(next, points), facts };
    }
    case 'technical': {
      const points: [number, number] = [0, 0];
      points[cmd.side] = cmd.points;
      return {
        state: addPoints(
          { ...state, technicals: [...state.technicals, { side: cmd.side, points: cmd.points }] },
          points,
        ),
        facts: [{ type: 'technical', data: { side: cmd.side, points: cmd.points } }],
      };
    }
    case 'timeout':
      return {
        state: {
          ...state,
          periods: holdPeriodClock(state.periods, at),
          timeouts: [...state.timeouts, { side: cmd.side, half: Math.max(1, half) }],
        },
        facts: [{ type: 'timeout', data: { side: cmd.side } }],
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

/** Pausing the match stops the clock (ADR 0006); the scorer restarts it with play. */
function onLifecycle(state: KabaddiState, action: string, ctx: ApplyContext): KabaddiState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  return state;
}

function commands(state: KabaddiState): CommandDescriptor[] {
  const list: Record<KabaddiState['phase'], KabaddiCommand['type'][]> = {
    pre_match: ['start_period', 'concede'],
    playing: [
      'raid',
      'player_out',
      'technical',
      'timeout',
      periodClockRunning(state.periods) ? 'stop_clock' : 'start_clock',
      'end_period',
      'concede',
    ],
    break: ['start_period', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

function result(state: KabaddiState): MatchResult {
  const summary = `${state.score[0]}–${state.score[1]}`;
  if (!state.outcome) return { status: 'in_progress', summary };
  const { winner, finish: how } = state.outcome;
  if (winner === null) return { status: 'drawn', summary };
  const label = how === 'played' ? '' : ` (${how})`;
  return { status: 'won', winnerSide: winner, summary: `${summary}${label}` };
}

function stats(state: KabaddiState): MetricRecord[] {
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => {
    const raids = state.raids.filter((r) => r.side === side);
    return [
      { metric: 'points_for', value: state.score[side], side },
      { metric: 'points_against', value: state.score[other(side)], side },
      { metric: 'raids', value: raids.length, side },
      { metric: 'successful_raids', value: raids.filter((r) => r.points[side] > 0).length, side },
      {
        metric: 'tackles',
        value: state.raids.filter((r) => r.side !== side && r.result === 'tackled').length,
        side,
      },
      { metric: 'all_outs', value: state.allOuts[side], side },
    ];
  });
  for (const side of [0, 1] as const) {
    for (const participantId of state.players[side]) {
      const raids = state.raids.filter((r) => r.raiderId === participantId);
      const touch = raids.reduce((n, r) => n + r.touches, 0);
      const bonus = raids.filter((r) => r.bonus).length;
      const tackles = state.raids.filter(
        (r) => r.tacklerId === participantId && r.result === 'tackled',
      );
      const add = (metric: string, value: number) =>
        records.push({ metric, value, side, participantId });
      add('raid_points', touch + bonus);
      add('touch_points', touch);
      add('bonus_points', bonus);
      add('raids', raids.length);
      add(
        'successful_raids',
        raids.filter((r) => r.touches > 0 || (r.bonus && r.result === 'safe')).length,
      );
      add('super_raids', raids.filter((r) => r.touches + (r.bonus ? 1 : 0) >= 3).length);
      add(
        'tackle_points',
        tackles.reduce((n, r) => n + (r.superTackle ? 2 : 1), 0),
      );
      add('super_tackles', tackles.filter((r) => r.superTackle).length);
      // Substitutes may come on, so everyone named in the team counts as appearing.
      add('appearances', 1);
    }
  }
  return records;
}

export const kabaddiEngine: SportEngine<KabaddiState, KabaddiSettings, KabaddiCommand> = {
  sport: 'kabaddi',
  version: 1,
  settingsSchema: kabaddiSettingsSchema,
  commandSchema: kabaddiCommandSchema,
  presets: kabaddiPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: kabaddiRuleCatalogue,
  ruleVariables: kabaddiRuleVariables,
};
