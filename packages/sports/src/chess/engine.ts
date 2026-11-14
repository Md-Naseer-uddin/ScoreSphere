import type { MatchResult, MatchRoster } from '@scoresphere/contracts';
import {
  type ApplyContext,
  type CommandDescriptor,
  type DomainFact,
  type EngineError,
  err,
  type MetricRecord,
  ok,
  type Result,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { chessRuleCatalogue, chessRuleVariables } from './rules.js';
import { chessPresets, type ChessSettings, chessSettingsSchema } from './settings.js';

/**
 * Chess clock and result, version 1 (FIDE Laws of Chess). The app keeps time and records
 * results; it does not check moves (spec scoring §2).
 *
 * Time is measured on the scoring device: each clock press carries its device time, so the
 * clocks can be rebuilt exactly from the ledger after a reload or a killed app (ADR 0006).
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const CHESS_ENDINGS = [
  'checkmate',
  'resignation',
  'agreement',
  'stalemate',
  'repetition',
  'fifty_move',
  'insufficient_material',
  'forfeit',
] as const;
export type ChessEnding = (typeof CHESS_ENDINGS)[number] | 'time';
const DECISIVE = new Set<ChessEnding>(['checkmate', 'resignation', 'forfeit', 'time']);

export const chessCommandSchema = z.discriminatedUnion('type', [
  /** Starts White's clock. */
  z.object({ type: z.literal('start_clock'), whiteSide: sideSchema }),
  /** The player to move presses the clock after moving. */
  z.object({ type: z.literal('press'), side: sideSchema }),
  /**
   * A flag has fallen. Usually a loss; a draw when the opponent cannot checkmate
   * (FIDE Article 6.9), which the arbiter or players decide.
   */
  z.object({ type: z.literal('flag'), side: sideSchema, result: z.enum(['loss', 'draw']) }),
  z.object({
    type: z.literal('result'),
    ending: z.enum(CHESS_ENDINGS),
    /** The winner, for a decisive ending. */
    winner: sideSchema.optional(),
  }),
  /** Extra time on a player's clock, e.g. after an opponent's illegal move (FIDE 7.5.5). */
  z.object({ type: z.literal('add_time'), side: sideSchema, seconds: z.int().min(1).max(3600) }),
]);
export type ChessCommand = z.infer<typeof chessCommandSchema>;

export interface ChessClockSide {
  remainingMs: number;
  moves: number;
}

export interface ChessState {
  config: ChessSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'complete';
  whiteSide: Side | null;
  toMove: Side | null;
  clocks: [ChessClockSide, ChessClockSide];
  /** Device time the running clock last started; null while stopped or paused. */
  turnStartedAt: number | null;
  /** Time already used on the current move before a pause. */
  turnUsedMs: number;
  outcome: { winner: Side | null; ending: ChessEnding } | null;
  timeUsedMs: [number, number];
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

/** Time used on the current move at `now`, before any delay is taken off. */
function usedOnMove(state: ChessState, now: number): number {
  return (
    state.turnUsedMs + (state.turnStartedAt === null ? 0 : Math.max(0, now - state.turnStartedAt))
  );
}

/** Time charged for a move that took `used`: the delay, if any, is free. */
function charged(state: ChessState, used: number): number {
  return Math.max(0, used - (state.config.timeControl?.delayMs ?? 0));
}

/** What each clock shows at `now`, for display; null without a time control. */
export function chessClocksAt(state: ChessState, now: number): [number, number] | null {
  if (!state.config.timeControl) return null;
  const shown: [number, number] = [state.clocks[0].remainingMs, state.clocks[1].remainingMs];
  if (state.phase === 'playing' && state.toMove !== null) {
    shown[state.toMove] -= charged(state, usedOnMove(state, now));
  }
  return [Math.max(0, shown[0]), Math.max(0, shown[1])];
}

function init(config: ChessSettings, roster: MatchRoster): ChessState {
  const base = config.timeControl?.baseMs ?? 0;
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    whiteSide: null,
    toMove: null,
    clocks: [
      { remainingMs: base, moves: 0 },
      { remainingMs: base, moves: 0 },
    ],
    turnStartedAt: null,
    turnUsedMs: 0,
    outcome: null,
    timeUsedMs: [0, 0],
  };
}

function validateSetup(_config: ChessSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length !== 1)
      return fail('SIDE_SIZE', 'Chess is one player against one.');
  }
  if (roster.sides[0]!.participantIds[0] === roster.sides[1]!.participantIds[0]) {
    return fail('DUPLICATE_PLAYER', 'Choose two different players.');
  }
  return ok(undefined);
}

function validate(
  state: ChessState,
  cmd: ChessCommand,
  ctx?: ApplyContext,
): Result<void, EngineError> {
  switch (cmd.type) {
    case 'start_clock':
      return state.phase === 'pre_match'
        ? ok(undefined)
        : fail('STARTED', 'The game has already started.');
    case 'press': {
      if (state.phase !== 'playing') return fail('NOT_PLAYING', 'The game is not in progress.');
      if (!state.config.timeControl) return fail('NO_CLOCK', 'This game has no clock.');
      if (cmd.side !== state.toMove) return fail('NOT_YOUR_TURN', 'It is the other player’s move.');
      if (state.turnStartedAt === null) return fail('PAUSED', 'Resume the game first.');
      if (
        ctx &&
        charged(state, usedOnMove(state, ctx.occurredAt)) >= state.clocks[cmd.side].remainingMs
      ) {
        return fail('FLAG_FELL', 'Time ran out before the clock was pressed.');
      }
      return ok(undefined);
    }
    case 'flag': {
      if (state.phase !== 'playing' || !state.config.timeControl)
        return fail('NOT_PLAYING', 'No clock is running.');
      if (cmd.side !== state.toMove)
        return fail('NOT_YOUR_TURN', 'Only the player to move can run out of time.');
      if (
        ctx &&
        charged(state, usedOnMove(state, ctx.occurredAt)) < state.clocks[cmd.side].remainingMs
      ) {
        return fail('TIME_LEFT', 'That player still has time.');
      }
      return ok(undefined);
    }
    case 'add_time':
      if (state.phase !== 'playing') return fail('NOT_PLAYING', 'The game is not in progress.');
      return state.config.timeControl ? ok(undefined) : fail('NO_CLOCK', 'This game has no clock.');
    case 'result': {
      if (state.phase === 'complete') return fail('GAME_OVER', 'The game is over.');
      if (state.phase !== 'playing' && cmd.ending !== 'forfeit')
        return fail('NOT_PLAYING', 'Start the game first.');
      const decisive = DECISIVE.has(cmd.ending);
      if (decisive && cmd.winner === undefined) return fail('PICK_WINNER', 'Choose who won.');
      if (!decisive && cmd.winner !== undefined) return fail('NO_WINNER', 'A draw has no winner.');
      return ok(undefined);
    }
  }
}

/** Stops the running clock, charging the time used so far to the player to move. */
function stopTurn(state: ChessState, at: number): ChessState {
  if (state.turnStartedAt === null) return state;
  return { ...state, turnUsedMs: usedOnMove(state, at), turnStartedAt: null };
}

function finish(
  state: ChessState,
  at: number,
  winner: Side | null,
  ending: ChessEnding,
): ChessState {
  const stopped = stopTurn(state, at);
  const clocks: [ChessClockSide, ChessClockSide] = [
    { ...stopped.clocks[0] },
    { ...stopped.clocks[1] },
  ];
  const timeUsedMs: [number, number] = [...stopped.timeUsedMs];
  if (stopped.toMove !== null && stopped.config.timeControl) {
    const used = charged(stopped, stopped.turnUsedMs);
    clocks[stopped.toMove].remainingMs = Math.max(0, clocks[stopped.toMove].remainingMs - used);
    timeUsedMs[stopped.toMove] += stopped.turnUsedMs;
  }
  return {
    ...stopped,
    clocks,
    timeUsedMs,
    turnUsedMs: 0,
    phase: 'complete',
    outcome: { winner, ending },
  };
}

function apply(
  state: ChessState,
  cmd: ChessCommand,
  ctx: ApplyContext,
): { state: ChessState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  switch (cmd.type) {
    case 'start_clock':
      return {
        state: {
          ...state,
          phase: 'playing',
          whiteSide: cmd.whiteSide,
          toMove: cmd.whiteSide,
          turnStartedAt: at,
          turnUsedMs: 0,
        },
        facts: [{ type: 'clock_started' }],
      };
    case 'press': {
      const tc = state.config.timeControl!;
      const side = cmd.side;
      const used = usedOnMove(state, at);
      const clocks: [ChessClockSide, ChessClockSide] = [
        { ...state.clocks[0] },
        { ...state.clocks[1] },
      ];
      const mine = clocks[side];
      mine.remainingMs -= charged(state, used);
      mine.moves += 1;
      mine.remainingMs += tc.incrementMs;
      const facts: DomainFact[] = [{ type: 'press', data: { side, usedMs: used } }];
      for (const stage of tc.stages) {
        if (mine.moves === stage.afterMoves) {
          mine.remainingMs += stage.addMs;
          facts.push({ type: 'time_added', data: { side, addMs: stage.addMs } });
        }
      }
      const timeUsedMs: [number, number] = [...state.timeUsedMs];
      timeUsedMs[side] += used;
      return {
        state: {
          ...state,
          clocks,
          timeUsedMs,
          toMove: other(side),
          turnStartedAt: at,
          turnUsedMs: 0,
        },
        facts,
      };
    }
    case 'flag': {
      const winner = cmd.result === 'loss' ? other(cmd.side) : null;
      return {
        state: finish(state, at, winner, 'time'),
        facts: [
          { type: 'flag_fell', data: { side: cmd.side } },
          { type: 'game_over', data: { winner } },
        ],
      };
    }
    case 'add_time': {
      const clocks: [ChessClockSide, ChessClockSide] = [
        { ...state.clocks[0] },
        { ...state.clocks[1] },
      ];
      const addMs = cmd.seconds * 1000;
      clocks[cmd.side].remainingMs += addMs;
      return {
        state: { ...state, clocks },
        facts: [{ type: 'time_added', data: { side: cmd.side, addMs } }],
      };
    }
    case 'result': {
      const winner = cmd.winner ?? null;
      return {
        state: finish(state, at, winner, cmd.ending),
        facts: [{ type: 'game_over', data: { winner } }],
      };
    }
  }
}

/** Pausing stops the clock without charging the paused time (FIDE Article 6.11). */
function onLifecycle(state: ChessState, action: string, ctx: ApplyContext): ChessState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') return stopTurn(state, ctx.occurredAt);
  if (action === 'RESUME') return { ...state, turnStartedAt: ctx.occurredAt };
  return state;
}

function commands(state: ChessState): CommandDescriptor[] {
  if (state.phase === 'pre_match') return [{ type: 'start_clock', label: 'Start clock' }];
  if (state.phase === 'complete') return [];
  return [
    ...(state.config.timeControl
      ? [
          { type: 'press', label: 'Press clock' },
          { type: 'flag', label: 'Flag fell' },
        ]
      : []),
    { type: 'result', label: 'Record result' },
  ];
}

const ENDING_TEXT: Record<ChessEnding, string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  agreement: 'agreed draw',
  stalemate: 'stalemate',
  repetition: 'repetition',
  fifty_move: '50-move rule',
  insufficient_material: 'insufficient material',
  forfeit: 'forfeit',
  time: 'time',
};

function result(state: ChessState): MatchResult {
  if (!state.outcome) return { status: 'in_progress', summary: '' };
  const { winner, ending } = state.outcome;
  if (winner === null) return { status: 'drawn', summary: `½–½ (${ENDING_TEXT[ending]})` };
  const score = winner === 0 ? '1–0' : '0–1';
  return { status: 'won', winnerSide: winner, summary: `${score} (${ENDING_TEXT[ending]})` };
}

function stats(state: ChessState): MetricRecord[] {
  return ([0, 1] as const).flatMap((side) => [
    {
      metric: 'moves',
      value: state.clocks[side].moves,
      side,
      participantId: state.players[side][0]!,
    },
    {
      metric: 'time_used_ms',
      value: state.timeUsedMs[side],
      side,
      participantId: state.players[side][0]!,
    },
  ]);
}

export const chessEngine: SportEngine<ChessState, ChessSettings, ChessCommand> = {
  sport: 'chess',
  version: 1,
  settingsSchema: chessSettingsSchema,
  commandSchema: chessCommandSchema,
  presets: chessPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: chessRuleCatalogue,
  ruleVariables: chessRuleVariables,
};
