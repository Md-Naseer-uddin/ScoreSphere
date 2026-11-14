import { idSchema, type MatchResult, type MatchRoster } from '@scoresphere/contracts';
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
import { tennisPresets, type TennisSettings, tennisSettingsSchema } from './settings.js';

/**
 * Tennis engine, version 1, following the ITF Rules of Tennis:
 * - games go 0, 15, 30, 40, deuce and advantage (or a deciding point with no-ad);
 * - sets go to `gamesPerSet` with a two-game lead, or a tie-break when level;
 * - the deciding set can end in a tie-break, run on with advantage, or be replaced by a
 *   match tie-break;
 * - service alternates each game. In a tie-break the first server serves one point, then
 *   each serves two. Whoever received first in a tie-break serves first in the next set.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const tennisCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start_match'),
    servingSide: sideSchema,
    /** Doubles: the first server of side 0 and of side 1, which fixes the service order. */
    firstServers: z.tuple([idSchema, idSchema]).optional(),
  }),
  z.object({ type: z.literal('point'), winner: sideSchema }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['retired', 'walkover', 'defaulted']),
  }),
]);
export type TennisCommand = z.infer<typeof tennisCommandSchema>;

export interface TennisSet {
  games: [number, number];
  /** Tie-break points, when the set (or the match tie-break) was decided by one. */
  tiebreak: [number, number] | null;
  /** This "set" is a match tie-break replacing the deciding set. */
  matchTiebreak: boolean;
  winner: Side | null;
}

export interface TennisGame {
  points: [number, number];
  kind: 'standard' | 'tiebreak';
  /** Points to win a tie-break. */
  target: number;
  /** Position in the service order of this game's (first) server. */
  serverIndex: number;
}

export interface TennisState {
  config: TennisSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'complete';
  /** Service order, one player per game in turn. */
  rotation: string[];
  gamesPlayed: number;
  sets: TennisSet[];
  game: TennisGame;
  outcome: { winner: Side; method: 'played' | 'retired' | 'walkover' | 'defaulted' } | null;
  stats: {
    points: [number, number];
    servicePointsWon: [number, number];
    servicePointsPlayed: [number, number];
    breaks: [number, number];
    tiebreaksWon: [number, number];
  };
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const pair = (): [number, number] => [0, 0];

export function tennisSideOf(state: TennisState, playerId: string): Side {
  return state.players[0].includes(playerId) ? 0 : 1;
}

export function tennisCurrentSet(state: TennisState): TennisSet {
  return state.sets[state.sets.length - 1]!;
}

export function tennisSetsWon(state: TennisState): [number, number] {
  const won = pair();
  for (const s of state.sets) if (s.winner !== null) won[s.winner]++;
  return won;
}

function isDecidingSet(state: TennisState): boolean {
  const [a, b] = tennisSetsWon(state);
  // In a one-set match the only set is the deciding set.
  const need = state.config.setsToWin - 1;
  return a === need && b === need;
}

/** Who serves the next point. */
export function tennisCurrentServer(state: TennisState): string | null {
  if (state.phase !== 'playing') return null;
  const { game, rotation } = state;
  const played = game.points[0] + game.points[1];
  const offset = game.kind === 'tiebreak' ? Math.ceil(played / 2) : 0;
  return rotation[(game.serverIndex + offset) % rotation.length]!;
}

/** The umpire's call for the current game. */
export type GameCall =
  | { kind: 'points'; values: [string, string] }
  | { kind: 'deuce' }
  | { kind: 'advantage'; side: Side }
  | { kind: 'tiebreak'; values: [number, number] };

const CALLS = ['0', '15', '30', '40'];

export function gameCall(state: TennisState): GameCall {
  const { points, kind } = state.game;
  if (kind === 'tiebreak') return { kind: 'tiebreak', values: [...points] };
  const [a, b] = points;
  if (a >= 3 && b >= 3) {
    if (a === b) return { kind: 'deuce' };
    return { kind: 'advantage', side: a > b ? 0 : 1 };
  }
  return { kind: 'points', values: [CALLS[a] ?? '40', CALLS[b] ?? '40'] };
}

function newGame(state: TennisState, kind: TennisGame['kind'], target: number): TennisGame {
  return { points: pair(), kind, target, serverIndex: state.gamesPlayed };
}

/** Starts a set; a deciding set may be a single match tie-break. */
function startSet(state: TennisState): TennisState {
  const deciding = isDecidingSet(state);
  const mtb = deciding && state.config.finalSet.type === 'match_tiebreak';
  const next: TennisState = {
    ...state,
    sets: [...state.sets, { games: pair(), tiebreak: null, matchTiebreak: mtb, winner: null }],
  };
  const target =
    mtb && state.config.finalSet.type === 'match_tiebreak' ? state.config.finalSet.points : 0;
  return { ...next, game: newGame(next, mtb ? 'tiebreak' : 'standard', target) };
}

function init(config: TennisSettings, roster: MatchRoster): TennisState {
  const state: TennisState = {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    rotation: [],
    gamesPlayed: 0,
    sets: [],
    game: { points: pair(), kind: 'standard', target: 0, serverIndex: 0 },
    outcome: null,
    stats: {
      points: pair(),
      servicePointsWon: pair(),
      servicePointsPlayed: pair(),
      breaks: pair(),
      tiebreaksWon: pair(),
    },
  };
  return startSet(state);
}

function validateSetup(config: TennisSettings, roster: MatchRoster): Result<void, EngineError> {
  const size = config.discipline === 'doubles' ? 2 : 1;
  for (const side of roster.sides) {
    if (side.participantIds.length !== size) {
      return err({
        code: 'SIDE_SIZE',
        message: `Each side needs ${size} player${size === 1 ? '' : 's'}.`,
      });
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return err({ code: 'DUPLICATE_PLAYER', message: 'A player can only appear once.' });
  return ok(undefined);
}

function validate(state: TennisState, cmd: TennisCommand): Result<void, EngineError> {
  const fail = (code: string, message: string) => err({ code, message });
  switch (cmd.type) {
    case 'start_match': {
      if (state.phase !== 'pre_match') return fail('STARTED', 'The match has already started.');
      if (state.config.discipline === 'doubles') {
        const [a, b] = cmd.firstServers ?? [];
        if (!a || !b || !state.players[0].includes(a) || !state.players[1].includes(b)) {
          return fail('PICK_SERVERS', 'Choose the first server for each side.');
        }
      }
      return ok(undefined);
    }
    case 'point':
      return state.phase === 'playing'
        ? ok(undefined)
        : fail(
            'NOT_PLAYING',
            state.phase === 'complete' ? 'The match is over.' : 'Choose who serves first.',
          );
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

function apply(
  state: TennisState,
  cmd: TennisCommand,
): { state: TennisState; facts: DomainFact[] } {
  switch (cmd.type) {
    case 'start_match': {
      const serving = cmd.servingSide;
      const receiving = other(serving);
      let rotation: string[];
      if (state.config.discipline === 'singles') {
        rotation = [state.players[serving][0]!, state.players[receiving][0]!];
      } else {
        const first = cmd.firstServers!;
        const partner = (side: Side) => state.players[side].find((p) => p !== first[side])!;
        rotation = [first[serving], first[receiving], partner(serving), partner(receiving)];
      }
      return {
        state: { ...state, phase: 'playing', rotation },
        facts: [{ type: 'match_started' }],
      };
    }
    case 'point':
      return point(state, cmd.winner);
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: { ...state, phase: 'complete', outcome: { winner, method: cmd.reason } },
        facts: [{ type: 'match_won', data: { side: winner, method: cmd.reason } }],
      };
    }
  }
}

function point(state: TennisState, winner: Side): { state: TennisState; facts: DomainFact[] } {
  const { config } = state;
  const server = tennisCurrentServer(state)!;
  const servingSide = tennisSideOf(state, server);
  const facts: DomainFact[] = [];

  const stats = {
    points: [...state.stats.points] as [number, number],
    servicePointsWon: [...state.stats.servicePointsWon] as [number, number],
    servicePointsPlayed: [...state.stats.servicePointsPlayed] as [number, number],
    breaks: [...state.stats.breaks] as [number, number],
    tiebreaksWon: [...state.stats.tiebreaksWon] as [number, number],
  };
  stats.points[winner]++;
  stats.servicePointsPlayed[servingSide]++;
  if (winner === servingSide) stats.servicePointsWon[servingSide]++;

  const game: TennisGame = { ...state.game, points: [...state.game.points] as [number, number] };
  game.points[winner]++;
  const [p, q] = [game.points[winner], game.points[other(winner)]];
  facts.push({ type: 'point', data: { side: winner } });

  let gameWon: boolean;
  if (game.kind === 'tiebreak') {
    gameWon = p >= game.target && p - q >= 2;
    // Ends change after every six points of a tie-break.
    if (!gameWon && (p + q) % 6 === 0)
      facts.push({ type: 'change_ends', data: { reason: 'tiebreak' } });
  } else {
    gameWon = (p >= 4 && p - q >= 2) || (config.noAd && p === 4 && q === 3);
  }

  let next: TennisState = { ...state, stats, game };
  if (!gameWon) return { state: next, facts };

  // The game is over.
  const set = {
    ...tennisCurrentSet(next),
    games: [...tennisCurrentSet(next).games] as [number, number],
  };
  set.games[winner]++;
  if (game.kind === 'tiebreak') {
    set.tiebreak = [...game.points];
    stats.tiebreaksWon[winner]++;
  } else if (winner !== servingSide) {
    stats.breaks[winner]++;
    facts.push({ type: 'break', data: { side: winner } });
  }
  facts.push({ type: 'game_won', data: { side: winner, games: [...set.games] } });

  const deciding = isDecidingSet(next);
  const rule = deciding ? config.finalSet : config.set;
  const [g, h] = [set.games[winner], set.games[other(winner)]];
  const setWon = game.kind === 'tiebreak' || (g >= config.gamesPerSet && g - h >= 2);
  if (setWon) set.winner = winner;
  const gamesInSet = set.games[0] + set.games[1];
  next = { ...next, sets: [...next.sets.slice(0, -1), set], gamesPlayed: next.gamesPlayed + 1 };
  // Ends change after odd-numbered games of a set, and at the end of a set of odd length.
  if (gamesInSet % 2 === 1 && !set.matchTiebreak)
    facts.push({ type: 'change_ends', data: { reason: 'games' } });

  if (setWon) {
    facts.push({ type: 'set_won', data: { side: winner, set: next.sets.length } });
    if (tennisSetsWon(next)[winner] >= config.setsToWin) {
      facts.push({ type: 'match_won', data: { side: winner, method: 'played' } });
      return {
        state: { ...next, phase: 'complete', outcome: { winner, method: 'played' } },
        facts,
      };
    }
    return { state: startSet(next), facts };
  }

  const tiebreakNow =
    rule.type !== 'advantage' &&
    set.games[0] === config.gamesPerSet &&
    set.games[1] === config.gamesPerSet;
  const target = tiebreakNow && rule.type === 'tiebreak' ? rule.points : 0;
  return {
    state: { ...next, game: newGame(next, tiebreakNow ? 'tiebreak' : 'standard', target) },
    facts,
  };
}

function commands(state: TennisState): CommandDescriptor[] {
  if (state.phase === 'pre_match') return [{ type: 'start_match', label: 'Start match' }];
  if (state.phase === 'playing') {
    return [
      { type: 'point', label: 'Point won' },
      { type: 'concede', label: 'End match early' },
    ];
  }
  return [];
}

/** Sets as "6–4, 6–7(5), [10–8]", always side 0 first. */
export function tennisScoreLine(state: TennisState): string {
  return state.sets
    .filter(
      (s) =>
        s.winner !== null || s.games[0] + s.games[1] > 0 || (s.tiebreak ?? [0, 0]).some(Boolean),
    )
    .map((s) => {
      if (s.matchTiebreak) return s.tiebreak ? `[${s.tiebreak[0]}–${s.tiebreak[1]}]` : '';
      const tb = s.tiebreak ? `(${Math.min(...s.tiebreak)})` : '';
      return `${s.games[0]}–${s.games[1]}${tb}`;
    })
    .filter(Boolean)
    .join(', ');
}

function result(state: TennisState): MatchResult {
  const line = tennisScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const method = state.outcome.method;
  const label = method === 'played' ? '' : method;
  const summary = !label
    ? line
    : line
      ? `${line} (${label})`
      : label[0]!.toUpperCase() + label.slice(1);
  return { status: 'won', winnerSide: state.outcome.winner, summary };
}

function stats(state: TennisState): MetricRecord[] {
  const won = tennisSetsWon(state);
  const games = pair();
  for (const s of state.sets)
    if (!s.matchTiebreak) {
      games[0] += s.games[0];
      games[1] += s.games[1];
    }
  const s = state.stats;
  return ([0, 1] as const).flatMap((side) => [
    { metric: 'sets_won', value: won[side], side },
    { metric: 'games_won', value: games[side], side },
    { metric: 'points_won', value: s.points[side], side },
    { metric: 'service_points_won', value: s.servicePointsWon[side], side },
    { metric: 'service_points_played', value: s.servicePointsPlayed[side], side },
    { metric: 'breaks', value: s.breaks[side], side },
    { metric: 'tiebreaks_won', value: s.tiebreaksWon[side], side },
  ]);
}

export const tennisEngine: SportEngine<TennisState, TennisSettings, TennisCommand> = {
  sport: 'tennis',
  version: 1,
  settingsSchema: tennisSettingsSchema,
  commandSchema: tennisCommandSchema,
  presets: tennisPresets.map((p) => ({
    ...p,
    config: { ...p.config, discipline: 'singles' as const },
  })),
  validateSetup,
  init,
  commands,
  validate,
  apply,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
};
