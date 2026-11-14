import { idSchema, type MatchResult, type MatchRoster } from '@scoresphere/contracts';
import {
  type CommandDescriptor,
  type DomainFact,
  type EngineError,
  err,
  ok,
  type Result,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { cricketPresets, type CricketSettings, cricketSettingsSchema } from './settings.js';
import { DELIVERY_KINDS, DISMISSALS } from './kinds.js';
import { cricketRuleCatalogue, cricketRuleVariables } from './rules.js';
import { cricketStats } from './stats.js';

/**
 * Cricket engine, version 1: limited overs, one innings a side, following the MCC Laws
 * (2017 Code, 3rd edition 2022) where a setting doesn't say otherwise.
 *
 * Batters are tracked by the end they stand at, so run-outs at either end and the 2022
 * rule that a new batter comes in at the striker's end after a catch fall out naturally.
 */

type Side = 0 | 1;
export type End = 'striker' | 'non_striker';
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export { DELIVERY_KINDS, DISMISSALS };
export type DismissalKind = (typeof DISMISSALS)[number] | 'six_and_out' | 'retired_out';

/** Dismissals credited to the bowler (Laws 32–39). One-tip-one-hand counts as a catch. */
const BOWLER_CREDITED = new Set<DismissalKind>([
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hit_wicket',
  'one_tip_one_hand',
]);

export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

const wicketSchema = z.object({
  kind: z.enum(DISMISSALS),
  /** Who is out. Only a run-out (or obstructing) can dismiss the non-striker. */
  batterId: idSchema,
  /** Run-outs: the end where the wicket was put down; the new batter comes in there. */
  end: z.enum(['striker', 'non_striker']).optional(),
  fielderId: idSchema.optional(),
});

export const cricketCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('toss'), winner: sideSchema, decision: z.enum(['bat', 'bowl']) }),
  z.object({
    type: z.literal('start_innings'),
    /** Needed for the first innings when no toss was recorded. */
    battingSide: sideSchema.optional(),
    strikerId: idSchema,
    nonStrikerId: idSchema,
  }),
  z.object({ type: z.literal('set_bowler'), bowlerId: idSchema }),
  z.object({
    type: z.literal('delivery'),
    kind: z.enum(DELIVERY_KINDS),
    /** Runs completed by running, or the boundary allowance (4 or 6). */
    runs: z.int().min(0).max(7),
    boundary: z.boolean(),
    wicket: wicketSchema.optional(),
  }),
  z.object({ type: z.literal('next_batter'), batterId: idSchema }),
  z.object({ type: z.literal('retire'), batterId: idSchema, kind: z.enum(['hurt', 'out']) }),
  /** Corrects who is on strike, e.g. after a scoring slip. */
  z.object({ type: z.literal('swap_ends') }),
  z.object({ type: z.literal('declare') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
  /** Extra runs to the batting side, e.g. from a local rule (D16b). */
  z.object({ type: z.literal('penalty_runs'), runs: z.int().min(1).max(10) }),
  /** Starts the count of wides in a row again (used by rules). */
  z.object({ type: z.literal('reset_wide_count') }),
]);
export type CricketCommand = z.infer<typeof cricketCommandSchema>;
type Cmd<T extends CricketCommand['type']> = Extract<CricketCommand, { type: T }>;

export type BatterStatus = 'batting' | 'out' | 'retired_hurt' | 'not_out';

export interface BatterCard {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  status: BatterStatus;
  dismissal: {
    kind: DismissalKind;
    bowlerId: string | null;
    fielderId: string | null;
  } | null;
}

export interface BowlerCard {
  id: string;
  legalBalls: number;
  /** Runs charged to the bowler: off the bat, wides and no-balls, never byes or leg-byes. */
  runs: number;
  wickets: number;
  maidens: number;
  wides: number;
  noBalls: number;
}

export interface BallRecord {
  /** Compact label for "this over", e.g. "4", "1wd", "W", "nb+2". */
  label: string;
  legal: boolean;
}

export interface OverRecord {
  bowlerId: string;
  balls: BallRecord[];
  legalBalls: number;
  /** Runs charged to bowlers in this over (for maidens). */
  bowlerRuns: number;
  /** Another bowler finished the over (Law 17.8); a split over is never a maiden. */
  split: boolean;
}

export type InningsClose = 'all_out' | 'overs' | 'target' | 'declared' | 'conceded';

export interface Innings {
  number: number;
  battingSide: Side;
  bowlingSide: Side;
  superOver: boolean;
  runs: number;
  wickets: number;
  legalBalls: number;
  maxBalls: number;
  maxWickets: number;
  target: number | null;
  extras: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
  batters: Record<string, BatterCard>;
  battingOrder: string[];
  bowlers: Record<string, BowlerCard>;
  bowlingOrder: string[];
  fallOfWickets: { wicket: number; runs: number; legalBalls: number; batterId: string }[];
  /** Who stands at each end; null while waiting for a new batter (or alone, last man stands). */
  atStrikerEnd: string | null;
  atNonStrikerEnd: string | null;
  bowlerId: string | null;
  previousOverBowlerId: string | null;
  currentOver: OverRecord | null;
  overs: OverRecord[];
  freeHit: boolean;
  consecutiveWides: number;
  /** The end a new batter must fill. */
  vacancy: End | null;
  /** Set when a wicket fell on an over's last ball: pick the batter, then the bowler. */
  overDue: boolean;
  closed: InningsClose | null;
}

export type CricketOutcome =
  | {
      kind: 'won';
      winner: Side;
      by: 'runs' | 'wickets' | 'super_over' | 'conceded';
      margin: number;
    }
  | { kind: 'tie' };

export interface CricketState {
  config: CricketSettings;
  players: [string[], string[]];
  toss: { winner: Side; decision: 'bat' | 'bowl' } | null;
  innings: Innings[];
  phase:
    'pre_match' | 'awaiting_bowler' | 'in_play' | 'awaiting_batter' | 'innings_break' | 'complete';
  outcome: CricketOutcome | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export function currentInnings(state: CricketState): Innings | null {
  return state.innings[state.innings.length - 1] ?? null;
}

/** "15.3" style overs from legal balls. */
export function oversText(legalBalls: number, ballsPerOver: number): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

/** The ball an event happened on, scorecard style: the sixth ball of the first over is "0.6". */
export function ballText(legalBalls: number, ballsPerOver: number): string {
  if (legalBalls === 0) return '0.0';
  return `${Math.floor((legalBalls - 1) / ballsPerOver)}.${((legalBalls - 1) % ballsPerOver) + 1}`;
}

export function inningsScore(inn: Innings, ballsPerOver: number): string {
  const wickets = inn.wickets >= inn.maxWickets ? '' : `/${inn.wickets}`;
  return `${inn.runs}${wickets} (${oversText(inn.legalBalls, ballsPerOver)})`;
}

/** Batters of the side batting now who can still come in (including retired-hurt ones). */
export function availableBatters(state: CricketState, inn: Innings): string[] {
  return state.players[inn.battingSide].filter((id) => {
    const card = inn.batters[id];
    return !card || card.status === 'retired_hurt';
  });
}

/** Overs this bowler has started in the innings (a part over counts). */
function oversStarted(inn: Innings, bowlerId: string, ballsPerOver: number): number {
  const card = inn.bowlers[bowlerId];
  const done = card ? Math.floor(card.legalBalls / ballsPerOver) : 0;
  return done + (inn.currentOver?.bowlerId === bowlerId && inn.currentOver.legalBalls > 0 ? 1 : 0);
}

function init(config: CricketSettings, roster: MatchRoster): CricketState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    toss: null,
    innings: [],
    phase: 'pre_match',
    outcome: null,
  };
}

function validateSetup(config: CricketSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    const n = side.participantIds.length;
    if (n < 2 || n > config.playersPerSide) {
      return fail('SIDE_SIZE', `Each side needs 2 to ${config.playersPerSide} players.`);
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function nextBattingSide(state: CricketState): Side | null {
  const done = state.innings;
  if (done.length === 0) {
    if (!state.toss) return null;
    return state.toss.decision === 'bat' ? state.toss.winner : other(state.toss.winner);
  }
  // Main innings alternate; in a super over the side that batted second bats first.
  const last = done[done.length - 1]!;
  if (done.length % 2 === 1) return other(last.battingSide);
  return last.battingSide;
}

function validate(state: CricketState, cmd: CricketCommand): Result<void, EngineError> {
  const inn = currentInnings(state);
  const { config } = state;
  switch (cmd.type) {
    case 'toss':
      return state.phase === 'pre_match' && !state.toss
        ? ok(undefined)
        : fail('TOSS_DONE', 'The toss is already recorded.');
    case 'start_innings': {
      if (state.phase !== 'pre_match' && state.phase !== 'innings_break') {
        return fail('INNINGS_IN_PROGRESS', 'An innings is already under way.');
      }
      const derived = nextBattingSide(state);
      const side = derived ?? cmd.battingSide;
      if (side === undefined) return fail('PICK_BATTING_SIDE', 'Choose which side bats first.');
      if (derived !== null && cmd.battingSide !== undefined && cmd.battingSide !== derived) {
        return fail('WRONG_BATTING_SIDE', 'The other side bats in this innings.');
      }
      const squad = state.players[side];
      if (!squad.includes(cmd.strikerId) || !squad.includes(cmd.nonStrikerId)) {
        return fail('PICK_OPENERS', 'Both openers must play for the batting side.');
      }
      if (cmd.strikerId === cmd.nonStrikerId)
        return fail('PICK_OPENERS', 'Choose two different openers.');
      return ok(undefined);
    }
    case 'set_bowler': {
      if (!inn || (state.phase !== 'awaiting_bowler' && state.phase !== 'in_play')) {
        return fail('NOT_NOW', 'A bowler can be chosen at the start of an over.');
      }
      if (!state.players[inn.bowlingSide].includes(cmd.bowlerId)) {
        return fail('PICK_BOWLER', 'The bowler must play for the fielding side.');
      }
      if (
        state.phase === 'in_play' &&
        (inn.currentOver?.legalBalls ?? 0) === 0 &&
        inn.bowlerId === cmd.bowlerId
      ) {
        return fail('SAME_BOWLER', 'That bowler is already bowling.');
      }
      if (!config.allowConsecutiveOvers && cmd.bowlerId === inn.previousOverBowlerId) {
        return fail('CONSECUTIVE_OVERS', 'A bowler cannot bowl two overs in a row.');
      }
      if (
        config.maxOversPerBowler !== null &&
        oversStarted(inn, cmd.bowlerId, config.ballsPerOver) >= config.maxOversPerBowler
      ) {
        return fail('BOWLER_LIMIT', `A bowler may bowl at most ${config.maxOversPerBowler} overs.`);
      }
      return ok(undefined);
    }
    case 'delivery':
      return validateDelivery(state, cmd);
    case 'next_batter': {
      if (!inn || state.phase !== 'awaiting_batter')
        return fail('NOT_NOW', 'No batter is needed now.');
      if (!availableBatters(state, inn).includes(cmd.batterId)) {
        return fail('PICK_BATTER', 'Choose a batter who has not batted or retired hurt.');
      }
      return ok(undefined);
    }
    case 'retire': {
      if (!inn || (state.phase !== 'in_play' && state.phase !== 'awaiting_bowler')) {
        return fail('NOT_NOW', 'Batters retire between deliveries.');
      }
      if (cmd.batterId !== inn.atStrikerEnd && cmd.batterId !== inn.atNonStrikerEnd) {
        return fail('NOT_BATTING', 'That player is not batting.');
      }
      return ok(undefined);
    }
    case 'swap_ends':
      if (!inn || (state.phase !== 'in_play' && state.phase !== 'awaiting_bowler')) {
        return fail('NOT_NOW', 'Ends can be swapped between deliveries.');
      }
      return inn.atStrikerEnd && inn.atNonStrikerEnd
        ? ok(undefined)
        : fail('NOT_NOW', 'Only one batter is in.');
    case 'declare':
      return inn &&
        !inn.closed &&
        ['in_play', 'awaiting_bowler', 'awaiting_batter'].includes(state.phase)
        ? ok(undefined)
        : fail('NOT_NOW', 'There is no innings to declare.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
    case 'penalty_runs':
    case 'reset_wide_count':
      return inn && !inn.closed && OPEN_PHASES.includes(state.phase)
        ? ok(undefined)
        : fail('NOT_NOW', 'There is no innings in progress.');
  }
}

const OPEN_PHASES: readonly CricketState['phase'][] = [
  'in_play',
  'awaiting_bowler',
  'awaiting_batter',
];

function validateDelivery(state: CricketState, cmd: Cmd<'delivery'>): Result<void, EngineError> {
  const inn = currentInnings(state);
  if (!inn || state.phase !== 'in_play') {
    return fail(
      'NOT_NOW',
      state.phase === 'awaiting_bowler'
        ? 'Choose the bowler first.'
        : state.phase === 'awaiting_batter'
          ? 'Choose the next batter first.'
          : 'No innings is in progress.',
    );
  }
  if (cmd.boundary && cmd.runs !== 4 && cmd.runs !== 6)
    return fail('BAD_BOUNDARY', 'A boundary is 4 or 6.');
  if (cmd.boundary && cmd.runs === 6 && !['bat', 'no_ball_bat'].includes(cmd.kind)) {
    return fail('BAD_BOUNDARY', 'Only a hit can score six.');
  }
  const w = cmd.wicket;
  if (!w) return ok(undefined);

  const noBall = cmd.kind.startsWith('no_ball');
  const wide = cmd.kind === 'wide';
  // Laws 21.18 and 22.8: off a no-ball only run-out, obstruction or hitting twice; off a wide also stumped or hit wicket.
  const allowed = new Set<string>(
    noBall
      ? ['run_out', 'obstructing_field', 'hit_ball_twice']
      : wide
        ? ['run_out', 'stumped', 'hit_wicket', 'obstructing_field']
        : DISMISSALS,
  );
  if (inn.freeHit) {
    for (const k of ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket', 'one_tip_one_hand'])
      allowed.delete(k);
  }
  if (!state.config.oneTipOneHand) allowed.delete('one_tip_one_hand');
  allowed.delete('timed_out');
  if (!allowed.has(w.kind)) {
    return fail(
      'DISMISSAL_NOT_ALLOWED',
      inn.freeHit
        ? 'Only a run-out can dismiss a batter off a free hit.'
        : 'That dismissal is not possible off this delivery.',
    );
  }
  const atEnds = [inn.atStrikerEnd, inn.atNonStrikerEnd];
  if (!atEnds.includes(w.batterId)) return fail('NOT_BATTING', 'That player is not batting.');
  const canBeNonStriker = w.kind === 'run_out' || w.kind === 'obstructing_field';
  if (!canBeNonStriker && w.batterId !== inn.atStrikerEnd) {
    return fail('NOT_STRIKER', 'Only the striker can be out that way.');
  }
  if (w.kind === 'run_out' && !w.end)
    return fail('PICK_END', 'Choose the end where the wicket was put down.');
  if (
    ['caught', 'one_tip_one_hand', 'bowled', 'lbw', 'stumped'].includes(w.kind) &&
    cmd.runs > 0 &&
    cmd.kind !== 'wide'
  ) {
    return fail('NO_RUNS', 'No runs count when the batter is out this way.');
  }
  if (w.fielderId && !state.players[inn.bowlingSide].includes(w.fielderId)) {
    return fail('PICK_FIELDER', 'The fielder must play for the fielding side.');
  }
  return ok(undefined);
}

/** Copies the parts of the current innings a command may change. */
function editable(state: CricketState): { next: CricketState; inn: Innings } {
  const innings = [...state.innings];
  const inn = { ...innings[innings.length - 1]! };
  inn.extras = { ...inn.extras };
  inn.batters = { ...inn.batters };
  inn.bowlers = { ...inn.bowlers };
  inn.currentOver = inn.currentOver
    ? { ...inn.currentOver, balls: [...inn.currentOver.balls] }
    : null;
  innings[innings.length - 1] = inn;
  return { next: { ...state, innings }, inn };
}

function batter(inn: Innings, id: string): BatterCard {
  const card = {
    ...(inn.batters[id] ?? {
      id,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      status: 'batting',
      dismissal: null,
    }),
  };
  inn.batters[id] = card;
  if (!inn.battingOrder.includes(id)) inn.battingOrder = [...inn.battingOrder, id];
  return card;
}

function bowler(inn: Innings, id: string): BowlerCard {
  const card = {
    ...(inn.bowlers[id] ?? {
      id,
      legalBalls: 0,
      runs: 0,
      wickets: 0,
      maidens: 0,
      wides: 0,
      noBalls: 0,
    }),
  };
  inn.bowlers[id] = card;
  if (!inn.bowlingOrder.includes(id)) inn.bowlingOrder = [...inn.bowlingOrder, id];
  return card;
}

function swapEnds(inn: Innings): void {
  [inn.atStrikerEnd, inn.atNonStrikerEnd] = [inn.atNonStrikerEnd, inn.atStrikerEnd];
  if (inn.vacancy) inn.vacancy = inn.vacancy === 'striker' ? 'non_striker' : 'striker';
  // Batting alone (last man stands): the batter always faces.
  if (!inn.atStrikerEnd && inn.atNonStrikerEnd && !inn.vacancy) {
    inn.atStrikerEnd = inn.atNonStrikerEnd;
    inn.atNonStrikerEnd = null;
  }
}

function newInnings(
  state: CricketState,
  battingSide: Side,
  superOver: boolean,
  target: number | null,
): Innings {
  const { config } = state;
  const batters = state.players[battingSide].length;
  const fullWickets = config.lastManStands ? batters : batters - 1;
  return {
    number: state.innings.length + 1,
    battingSide,
    bowlingSide: other(battingSide),
    superOver,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    maxBalls: (superOver ? 1 : config.oversPerInnings) * config.ballsPerOver,
    // A super over ends after two wickets (ICC playing conditions, Appendix F).
    maxWickets: superOver ? Math.min(2, fullWickets) : fullWickets,
    target,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
    batters: {},
    battingOrder: [],
    bowlers: {},
    bowlingOrder: [],
    fallOfWickets: [],
    atStrikerEnd: null,
    atNonStrikerEnd: null,
    bowlerId: null,
    previousOverBowlerId: null,
    currentOver: null,
    overs: [],
    freeHit: false,
    consecutiveWides: 0,
    vacancy: null,
    overDue: false,
    closed: null,
  };
}

function apply(
  state: CricketState,
  cmd: CricketCommand,
): { state: CricketState; facts: DomainFact[] } {
  switch (cmd.type) {
    case 'toss':
      return {
        state: { ...state, toss: { winner: cmd.winner, decision: cmd.decision } },
        facts: [],
      };
    case 'start_innings': {
      const side = nextBattingSide(state) ?? cmd.battingSide!;
      const count = state.innings.length;
      const superOver = count >= 2;
      const prev = state.innings[count - 1];
      const target = count % 2 === 1 && prev ? prev.runs + 1 : null;
      const inn = newInnings(state, side, superOver, target);
      inn.atStrikerEnd = cmd.strikerId;
      inn.atNonStrikerEnd = cmd.nonStrikerId;
      batter(inn, cmd.strikerId);
      batter(inn, cmd.nonStrikerId);
      return {
        state: { ...state, innings: [...state.innings, inn], phase: 'awaiting_bowler' },
        facts: [
          { type: 'innings_started', data: { innings: inn.number, battingSide: side, superOver } },
        ],
      };
    }
    case 'set_bowler': {
      const { next, inn } = editable(state);
      bowler(inn, cmd.bowlerId);
      if (inn.currentOver && inn.currentOver.balls.length > 0) {
        // A bowler replaced mid-over (Law 17.8): the over continues under the new bowler.
        inn.currentOver.bowlerId = cmd.bowlerId;
        inn.currentOver.split = true;
      } else {
        inn.currentOver = {
          bowlerId: cmd.bowlerId,
          balls: [],
          legalBalls: 0,
          bowlerRuns: 0,
          split: false,
        };
      }
      inn.bowlerId = cmd.bowlerId;
      return { state: { ...next, phase: 'in_play' }, facts: [] };
    }
    case 'delivery':
      return delivery(state, cmd);
    case 'next_batter': {
      const { next, inn } = editable(state);
      const card = batter(inn, cmd.batterId);
      card.status = 'batting';
      if (inn.vacancy === 'non_striker') inn.atNonStrikerEnd = cmd.batterId;
      else inn.atStrikerEnd = cmd.batterId;
      inn.vacancy = null;
      const phase = inn.overDue ? 'awaiting_bowler' : 'in_play';
      inn.overDue = false;
      return { state: { ...next, phase }, facts: [] };
    }
    case 'retire':
      return retire(state, cmd);
    case 'swap_ends': {
      const { next, inn } = editable(state);
      [inn.atStrikerEnd, inn.atNonStrikerEnd] = [inn.atNonStrikerEnd, inn.atStrikerEnd];
      return { state: next, facts: [] };
    }
    case 'declare': {
      const { next, inn } = editable(state);
      return closeInnings(next, inn, 'declared', []);
    }
    case 'penalty_runs': {
      const { next, inn } = editable(state);
      inn.runs += cmd.runs;
      inn.extras.penalties += cmd.runs;
      const facts: DomainFact[] = [{ type: 'penalty_runs', data: { runs: cmd.runs } }];
      if (inn.target !== null && inn.runs >= inn.target)
        return closeInnings(next, inn, 'target', facts);
      return { state: next, facts };
    }
    case 'reset_wide_count': {
      const { next, inn } = editable(state);
      inn.consecutiveWides = 0;
      return { state: next, facts: [] };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...state,
          phase: 'complete',
          outcome: { kind: 'won', winner, by: 'conceded', margin: 0 },
        },
        facts: [{ type: 'match_won', data: { side: winner, by: 'conceded' } }],
      };
    }
  }
}

function ballLabel(cmd: Cmd<'delivery'>, out: boolean): string {
  const r = cmd.runs;
  const base: Record<DeliveryKind, string> = {
    bat: r === 0 ? '•' : String(r),
    bye: `${r}b`,
    leg_bye: `${r}lb`,
    wide: r ? `wd+${r}` : 'wd',
    no_ball_bat: r ? `nb+${r}` : 'nb',
    no_ball_bye: `nb+${r}b`,
    no_ball_leg_bye: `nb+${r}lb`,
  };
  if (!out) return base[cmd.kind];
  return cmd.kind === 'bat' && r === 0 ? 'W' : `W ${base[cmd.kind]}`;
}

function delivery(
  state: CricketState,
  cmd: Cmd<'delivery'>,
): { state: CricketState; facts: DomainFact[] } {
  const { config } = state;
  const { next, inn } = editable(state);
  const facts: DomainFact[] = [];
  const kind = cmd.kind;
  const noBall = kind.startsWith('no_ball');
  const wide = kind === 'wide';
  const legal = !noBall && !wide;
  const offBat = kind === 'bat' || kind === 'no_ball_bat';
  const strikerId = inn.atStrikerEnd!;
  const bowlerCard = bowler(inn, inn.bowlerId!);
  const over = inn.currentOver!;

  const sixOut = config.sixAndOut !== 'off' && offBat && cmd.boundary && cmd.runs === 6;
  const runs = sixOut && config.sixAndOut === 'out_no_runs' ? 0 : cmd.runs;
  const penalty = wide ? config.wideRuns : noBall ? config.noBallRuns : 0;

  // Runs and extras (Laws 18, 21, 22, 23).
  inn.runs += penalty + runs;
  let charged = penalty;
  if (wide) {
    inn.extras.wides += penalty + runs;
    charged += runs;
    bowlerCard.wides += 1;
  } else if (noBall) {
    inn.extras.noBalls += penalty;
    bowlerCard.noBalls += 1;
  }
  if (kind === 'bye' || kind === 'no_ball_bye') inn.extras.byes += runs;
  if (kind === 'leg_bye' || kind === 'no_ball_leg_bye') inn.extras.legByes += runs;
  if (!wide) {
    const card = batter(inn, strikerId);
    card.balls += 1;
    if (offBat) {
      card.runs += runs;
      charged += runs;
      if (cmd.boundary && runs === 4) card.fours += 1;
      if (cmd.boundary && runs === 6) card.sixes += 1;
    }
  }
  bowlerCard.runs += charged;
  over.bowlerRuns += charged;
  if (legal) {
    inn.legalBalls += 1;
    bowlerCard.legalBalls += 1;
    over.legalBalls += 1;
  }
  over.balls.push({ label: ballLabel(cmd, Boolean(cmd.wicket) || sixOut), legal });
  facts.push({ type: 'ball', data: { runs: penalty + runs, legal, kind } });
  if (offBat && cmd.boundary && runs === 6) facts.push({ type: 'six' });
  if (offBat && cmd.boundary && runs === 4) facts.push({ type: 'four' });

  // Gully: wides in a row add penalty runs.
  inn.consecutiveWides = wide ? inn.consecutiveWides + 1 : 0;
  if (config.consecutiveWides && inn.consecutiveWides >= config.consecutiveWides.threshold) {
    inn.runs += config.consecutiveWides.penaltyRuns;
    inn.extras.penalties += config.consecutiveWides.penaltyRuns;
    inn.consecutiveWides = 0;
    facts.push({ type: 'wide_penalty', data: { runs: config.consecutiveWides.penaltyRuns } });
  }

  // Batters cross once per run completed; boundaries are not run.
  if (!cmd.boundary && cmd.runs % 2 === 1) swapEnds(inn);

  const wasFreeHit = inn.freeHit;
  // Law 21.19 (playing conditions): a free hit follows a no-ball, and carries over a wide or no-ball.
  inn.freeHit = config.freeHit && (noBall || (wasFreeHit && !legal));

  // Wickets.
  const dismissal =
    cmd.wicket ?? (sixOut ? { kind: 'six_and_out' as const, batterId: strikerId } : undefined);
  if (dismissal) {
    const outId = dismissal.batterId;
    const runOut = dismissal.kind === 'run_out' || dismissal.kind === 'obstructing_field';
    let vacancy: End;
    if (runOut && 'end' in dismissal && dismissal.end) {
      // The survivor goes to the other end; the new batter comes in where the wicket fell.
      vacancy = dismissal.end;
      const survivor = inn.atStrikerEnd === outId ? inn.atNonStrikerEnd : inn.atStrikerEnd;
      if (vacancy === 'striker') {
        inn.atStrikerEnd = null;
        inn.atNonStrikerEnd = survivor;
      } else {
        inn.atNonStrikerEnd = null;
        inn.atStrikerEnd = survivor;
      }
    } else if (runOut) {
      vacancy = inn.atStrikerEnd === outId ? 'striker' : 'non_striker';
      if (vacancy === 'striker') inn.atStrikerEnd = null;
      else inn.atNonStrikerEnd = null;
    } else {
      // Caught (Law 18.11), bowled, lbw, stumped and so on: the new batter faces.
      if (inn.atNonStrikerEnd === outId)
        [inn.atStrikerEnd, inn.atNonStrikerEnd] = [inn.atNonStrikerEnd, inn.atStrikerEnd];
      inn.atStrikerEnd = null;
      vacancy = 'striker';
    }
    const card = batter(inn, outId);
    const credited = BOWLER_CREDITED.has(dismissal.kind);
    card.status = 'out';
    card.dismissal = {
      kind: dismissal.kind,
      bowlerId: credited ? bowlerCard.id : null,
      fielderId: 'fielderId' in dismissal ? (dismissal.fielderId ?? null) : null,
    };
    if (credited) bowlerCard.wickets += 1;
    inn.wickets += 1;
    inn.fallOfWickets = [
      ...inn.fallOfWickets,
      { wicket: inn.wickets, runs: inn.runs, legalBalls: inn.legalBalls, batterId: outId },
    ];
    inn.vacancy = vacancy;
    facts.push({ type: 'wicket', data: { kind: dismissal.kind, batterId: outId, credited } });
  }

  // End of over (Law 17): ends change and the bowler must be chosen again.
  let overDone = false;
  if (legal && over.legalBalls >= config.ballsPerOver) {
    overDone = true;
    if (over.bowlerRuns === 0 && !over.split) bowlerCard.maidens += 1;
    inn.overs = [...inn.overs, over];
    inn.currentOver = null;
    inn.previousOverBowlerId = bowlerCard.id;
    inn.bowlerId = null;
    swapEnds(inn);
    facts.push({ type: 'over_complete', data: { over: inn.overs.length } });
  }

  // Innings end, or who is needed next.
  const close: InningsClose | null =
    inn.target !== null && inn.runs >= inn.target
      ? 'target'
      : inn.wickets >= inn.maxWickets
        ? 'all_out'
        : inn.legalBalls >= inn.maxBalls
          ? 'overs'
          : null;
  if (close) return closeInnings(next, inn, close, facts);

  if (inn.vacancy) {
    if (availableBatters(next, inn).length === 0) {
      // Last man stands: the survivor bats on alone at the striker's end.
      inn.atStrikerEnd = inn.atStrikerEnd ?? inn.atNonStrikerEnd;
      inn.atNonStrikerEnd = null;
      inn.vacancy = null;
      return { state: { ...next, phase: overDone ? 'awaiting_bowler' : 'in_play' }, facts };
    }
    inn.overDue = overDone;
    return { state: { ...next, phase: 'awaiting_batter' }, facts };
  }
  return { state: { ...next, phase: overDone ? 'awaiting_bowler' : 'in_play' }, facts };
}

function retire(
  state: CricketState,
  cmd: Cmd<'retire'>,
): { state: CricketState; facts: DomainFact[] } {
  const { next, inn } = editable(state);
  const card = batter(inn, cmd.batterId);
  const end: End = inn.atStrikerEnd === cmd.batterId ? 'striker' : 'non_striker';
  if (end === 'striker') inn.atStrikerEnd = null;
  else inn.atNonStrikerEnd = null;
  const facts: DomainFact[] = [];
  if (cmd.kind === 'hurt') {
    // Law 25.4.2: a retired-hurt batter may resume later; it is not a wicket.
    card.status = 'retired_hurt';
  } else {
    // Law 25.4.3: retired out counts as a wicket, not credited to the bowler.
    card.status = 'out';
    card.dismissal = { kind: 'retired_out', bowlerId: null, fielderId: null };
    inn.wickets += 1;
    inn.fallOfWickets = [
      ...inn.fallOfWickets,
      { wicket: inn.wickets, runs: inn.runs, legalBalls: inn.legalBalls, batterId: cmd.batterId },
    ];
    facts.push({
      type: 'wicket',
      data: { kind: 'retired_out', batterId: cmd.batterId, credited: false },
    });
    if (inn.wickets >= inn.maxWickets) return closeInnings(next, inn, 'all_out', facts);
  }
  const overDue = state.phase === 'awaiting_bowler';
  if (availableBatters(next, inn).length === 0) {
    // Last man stands: the remaining batter bats on alone.
    inn.atStrikerEnd = inn.atStrikerEnd ?? inn.atNonStrikerEnd;
    inn.atNonStrikerEnd = null;
    return { state: { ...next, phase: overDue ? 'awaiting_bowler' : 'in_play' }, facts };
  }
  inn.vacancy = end;
  inn.overDue = overDue;
  return { state: { ...next, phase: 'awaiting_batter' }, facts };
}

function closeInnings(
  state: CricketState,
  inn: Innings,
  reason: InningsClose,
  facts: DomainFact[],
): { state: CricketState; facts: DomainFact[] } {
  inn.closed = reason;
  inn.vacancy = null;
  inn.overDue = false;
  // Batters still in finish not out.
  for (const id of [inn.atStrikerEnd, inn.atNonStrikerEnd]) {
    if (id && inn.batters[id]?.status === 'batting')
      inn.batters[id] = { ...inn.batters[id]!, status: 'not_out' };
  }
  if (inn.currentOver && inn.currentOver.balls.length > 0) {
    inn.overs = [...inn.overs, inn.currentOver];
  }
  inn.currentOver = null;
  facts.push({ type: 'innings_closed', data: { innings: inn.number, reason } });

  const count = state.innings.length;
  if (count % 2 === 1) return { state: { ...state, phase: 'innings_break' }, facts };

  const first = state.innings[count - 2]!;
  const second = inn;
  let outcome: CricketOutcome;
  if (second.runs > first.runs) {
    const margin = second.maxWickets - second.wickets;
    outcome = {
      kind: 'won',
      winner: second.battingSide,
      by: second.superOver ? 'super_over' : 'wickets',
      margin,
    };
  } else if (second.runs < first.runs) {
    outcome = {
      kind: 'won',
      winner: first.battingSide,
      by: second.superOver ? 'super_over' : 'runs',
      margin: first.runs - second.runs,
    };
  } else {
    const mode = state.config.superOver;
    const superOversPlayed = (count - 2) / 2;
    if (mode === 'until_decided' || (mode === 'once' && superOversPlayed === 0)) {
      facts.push({ type: 'super_over_needed' });
      return { state: { ...state, phase: 'innings_break' }, facts };
    }
    outcome = { kind: 'tie' };
  }
  facts.push({ type: 'match_won', data: { outcome } });
  return { state: { ...state, phase: 'complete', outcome }, facts };
}

function commands(state: CricketState): CommandDescriptor[] {
  const list: Record<CricketState['phase'], string[]> = {
    pre_match: ['toss', 'start_innings'],
    innings_break: ['start_innings'],
    awaiting_bowler: ['set_bowler', 'retire', 'swap_ends', 'declare'],
    in_play: ['delivery', 'set_bowler', 'retire', 'swap_ends', 'declare'],
    awaiting_batter: ['next_batter', 'declare'],
    complete: [],
  };
  const types = list[state.phase];
  return [...types, ...(state.phase === 'complete' ? [] : ['concede'])].map((type) => ({
    type,
    label: type,
  }));
}

/** How a batter got out, scorecard style, e.g. "c Ravi b Arjun". */
export function howOut(card: BatterCard, name: (id: string | null) => string): string {
  if (card.status === 'retired_hurt') return 'retired hurt';
  if (card.status !== 'out' || !card.dismissal) return 'not out';
  const { kind, bowlerId, fielderId } = card.dismissal;
  const b = `b ${name(bowlerId)}`;
  switch (kind) {
    case 'bowled':
      return b;
    case 'caught':
      return fielderId && fielderId === bowlerId ? `c & ${b}` : `c ${name(fielderId)} ${b}`;
    case 'lbw':
      return `lbw ${b}`;
    case 'stumped':
      return `st ${name(fielderId)} ${b}`;
    case 'hit_wicket':
      return `hit wicket ${b}`;
    case 'one_tip_one_hand':
      return `one tip one hand ${name(fielderId)} ${b}`;
    case 'run_out':
      return fielderId ? `run out (${name(fielderId)})` : 'run out';
    case 'six_and_out':
      return 'six and out';
    case 'retired_out':
      return 'retired out';
    case 'obstructing_field':
      return 'obstructing the field';
    case 'hit_ball_twice':
      return 'hit the ball twice';
    case 'timed_out':
      return 'timed out';
  }
}

export function marginText(outcome: CricketOutcome): string {
  if (outcome.kind === 'tie') return 'Match tied';
  switch (outcome.by) {
    case 'runs':
      return `won by ${outcome.margin} run${outcome.margin === 1 ? '' : 's'}`;
    case 'wickets':
      return `won by ${outcome.margin} wicket${outcome.margin === 1 ? '' : 's'}`;
    case 'super_over':
      return 'won the super over';
    case 'conceded':
      return 'won (conceded)';
  }
}

function result(state: CricketState): MatchResult {
  const bpo = state.config.ballsPerOver;
  const line = state.innings
    .filter((i) => !i.superOver)
    .map((i) => inningsScore(i, bpo))
    .join(' · ');
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const margin = marginText(state.outcome);
  const summary = [line, margin].filter(Boolean).join(' · ');
  if (state.outcome.kind === 'tie') return { status: 'drawn', summary };
  return { status: 'won', winnerSide: state.outcome.winner, summary };
}

export const cricketEngine: SportEngine<CricketState, CricketSettings, CricketCommand> = {
  sport: 'cricket',
  version: 1,
  settingsSchema: cricketSettingsSchema,
  commandSchema: cricketCommandSchema,
  presets: cricketPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats: cricketStats,
  ruleCatalogue: cricketRuleCatalogue,
  ruleVariables: cricketRuleVariables,
};
