import type { MatchResult, MatchRoster } from '@scoresphere/contracts';
import {
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
import { carromRuleCatalogue, carromRuleVariables } from './rules.js';
import { carromPresets, type CarromSettings, carromSettingsSchema } from './settings.js';

/**
 * Carrom, version 1, following the ICF Laws of Carrom where a setting doesn't say otherwise.
 * The scorer records each board's result, as on a carrom scoresheet: who won, how many of
 * the loser's coins were left and who covered the queen. Fouls are recorded for statistics;
 * the penalty coin itself is put back on the board by the players.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const carromCommandSchema = z.discriminatedUnion('type', [
  /** The toss decides who breaks first; breaks then alternate. */
  z.object({ type: z.literal('start_match'), firstBreak: sideSchema }),
  z.object({
    type: z.literal('board'),
    winner: sideSchema,
    /** The loser's coins still on the board. */
    coinsLeft: z.int().min(0).max(9),
    /** Who pocketed and covered the queen, if anyone. */
    queenCoveredBy: sideSchema.nullable(),
  }),
  z.object({ type: z.literal('foul'), side: sideSchema }),
  /** Extra points in the current game, e.g. from a custom rule. */
  z.object({ type: z.literal('bonus'), side: sideSchema, points: z.int().min(1).max(10) }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['retired', 'walkover', 'forfeit']),
  }),
]);
export type CarromCommand = z.infer<typeof carromCommandSchema>;

export interface BoardRecord {
  winner: Side;
  coinsLeft: number;
  queenCoveredBy: Side | null;
  /** Points the winner scored, the queen included when it counted. */
  points: number;
  queenCounted: boolean;
  breakSide: Side;
}

export interface CarromGame {
  points: [number, number];
  boards: BoardRecord[];
  winner: Side | null;
}

export interface CarromState {
  config: CarromSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'complete';
  firstBreak: Side | null;
  /** Finished games and the current one, which is last. */
  games: CarromGame[];
  fouls: [number, number];
  outcome: { winner: Side; method: 'played' | 'retired' | 'walkover' | 'forfeit' } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export const carromCurrentGame = (state: CarromState): CarromGame => state.games.at(-1)!;

export function carromGamesWon(state: CarromState): [number, number] {
  const won: [number, number] = [0, 0];
  for (const g of state.games) if (g.winner !== null) won[g.winner] += 1;
  return won;
}

/** Who breaks the next board: breaks alternate through the whole match. */
export function nextBreak(state: CarromState): Side | null {
  if (state.firstBreak === null) return null;
  const boards = state.games.reduce((n, g) => n + g.boards.length, 0);
  return boards % 2 === 0 ? state.firstBreak : other(state.firstBreak);
}

function init(config: CarromSettings, roster: MatchRoster): CarromState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    firstBreak: null,
    games: [{ points: [0, 0], boards: [], winner: null }],
    fouls: [0, 0],
    outcome: null,
  };
}

function validateSetup(config: CarromSettings, roster: MatchRoster): Result<void, EngineError> {
  const n = config.discipline === 'doubles' ? 2 : 1;
  if (!roster.sides.every((s) => s.participantIds.length === n)) {
    return fail(
      'SIDE_SIZE',
      config.discipline === 'doubles'
        ? 'Doubles needs two players a side.'
        : 'Singles needs one player a side.',
    );
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  return new Set(all).size === all.length
    ? ok(undefined)
    : fail('DUPLICATE_PLAYER', 'A player can only appear once.');
}

function validate(state: CarromState, cmd: CarromCommand): Result<void, EngineError> {
  switch (cmd.type) {
    case 'start_match':
      return state.phase === 'pre_match'
        ? ok(undefined)
        : fail('STARTED', 'The match has started.');
    case 'board':
      return state.phase === 'playing' ? ok(undefined) : fail('NOT_NOW', 'Start the match first.');
    case 'foul':
    case 'bonus':
      return state.phase === 'playing'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

/** Ends the current game when a side reaches the target, or the boards run out with a leader. */
function settleGame(state: CarromState, facts: DomainFact[]): CarromState {
  const game = carromCurrentGame(state);
  const { targetPoints, maxBoards, gamesToWin } = state.config;
  const [a, b] = game.points;
  let winner: Side | null = null;
  if (a >= targetPoints || b >= targetPoints) winner = a >= b ? 0 : 1;
  else if (maxBoards !== null && game.boards.length >= maxBoards && a !== b) winner = a > b ? 0 : 1;
  if (winner === null) return state;
  const games = [...state.games.slice(0, -1), { ...game, winner }];
  let next: CarromState = { ...state, games };
  facts.push({ type: 'game_won', data: { side: winner, game: games.length } });
  if (carromGamesWon(next)[winner] >= gamesToWin) {
    facts.push({ type: 'match_won', data: { side: winner } });
    return { ...next, phase: 'complete', outcome: { winner, method: 'played' } };
  }
  next = { ...next, games: [...games, { points: [0, 0], boards: [], winner: null }] };
  return next;
}

function apply(
  state: CarromState,
  cmd: CarromCommand,
): { state: CarromState; facts: DomainFact[] } {
  const facts: DomainFact[] = [];
  switch (cmd.type) {
    case 'start_match':
      return { state: { ...state, phase: 'playing', firstBreak: cmd.firstBreak }, facts };
    case 'board': {
      const game = carromCurrentGame(state);
      const { queenPoints, queenCountsBelow } = state.config;
      const queenCounted =
        cmd.queenCoveredBy === cmd.winner &&
        (queenCountsBelow === null || game.points[cmd.winner] < queenCountsBelow);
      const points = cmd.coinsLeft + (queenCounted ? queenPoints : 0);
      const scores: [number, number] = [...game.points];
      scores[cmd.winner] += points;
      const board: BoardRecord = {
        winner: cmd.winner,
        coinsLeft: cmd.coinsLeft,
        queenCoveredBy: cmd.queenCoveredBy,
        points,
        queenCounted,
        breakSide: nextBreak(state)!,
      };
      facts.push({
        type: 'board_won',
        data: { side: cmd.winner, points, queen: queenCounted, board: game.boards.length + 1 },
      });
      const next: CarromState = {
        ...state,
        games: [
          ...state.games.slice(0, -1),
          { ...game, points: scores, boards: [...game.boards, board] },
        ],
      };
      return { state: settleGame(next, facts), facts };
    }
    case 'foul': {
      const fouls: [number, number] = [...state.fouls];
      fouls[cmd.side] += 1;
      facts.push({ type: 'foul', data: { side: cmd.side } });
      return { state: { ...state, fouls }, facts };
    }
    case 'bonus': {
      const game = carromCurrentGame(state);
      const scores: [number, number] = [...game.points];
      scores[cmd.side] += cmd.points;
      const next = { ...state, games: [...state.games.slice(0, -1), { ...game, points: scores }] };
      return { state: settleGame(next, facts), facts };
    }
    case 'concede': {
      const winner = other(cmd.side);
      facts.push({ type: 'match_won', data: { side: winner } });
      return {
        state: { ...state, phase: 'complete', outcome: { winner, method: cmd.reason } },
        facts,
      };
    }
  }
}

function commands(state: CarromState): CommandDescriptor[] {
  const types: CarromCommand['type'][] =
    state.phase === 'pre_match'
      ? ['start_match', 'concede']
      : state.phase === 'playing'
        ? ['board', 'foul', 'concede']
        : [];
  return types.map((type) => ({ type, label: type }));
}

/** Game scores, side 0 first: "25–12, 18–25". */
export function carromScoreLine(state: CarromState): string {
  return state.games
    .filter((g) => g.winner !== null || g.boards.length > 0 || g.points[0] + g.points[1] > 0)
    .map((g) => `${g.points[0]}–${g.points[1]}`)
    .join(', ');
}

function result(state: CarromState): MatchResult {
  const line = carromScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const { winner, method } = state.outcome;
  const summary =
    method === 'played'
      ? line
      : line
        ? `${line} (${method})`
        : method[0]!.toUpperCase() + method.slice(1);
  return { status: 'won', winnerSide: winner, summary };
}

function stats(state: CarromState): MetricRecord[] {
  const boards = state.games.flatMap((g) => g.boards);
  const won = carromGamesWon(state);
  return ([0, 1] as const).flatMap((side) => {
    const sideRecords: MetricRecord[] = [
      { metric: 'games_won', value: won[side], side },
      { metric: 'boards_won', value: boards.filter((b) => b.winner === side).length, side },
      { metric: 'points_won', value: state.games.reduce((n, g) => n + g.points[side], 0), side },
      {
        metric: 'queens_covered',
        value: boards.filter((b) => b.queenCoveredBy === side).length,
        side,
      },
      { metric: 'fouls', value: state.fouls[side], side },
    ];
    // Partners share their side's record.
    return [
      ...sideRecords,
      ...state.players[side].flatMap((participantId) =>
        sideRecords.map((r) => ({ ...r, participantId })),
      ),
    ];
  });
}

export const carromEngine: SportEngine<CarromState, CarromSettings, CarromCommand> = {
  sport: 'carrom',
  version: 1,
  settingsSchema: carromSettingsSchema,
  commandSchema: carromCommandSchema,
  presets: carromPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: carromRuleCatalogue,
  ruleVariables: carromRuleVariables,
};
