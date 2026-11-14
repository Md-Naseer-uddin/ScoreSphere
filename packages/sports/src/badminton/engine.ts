import { idSchema, type MatchRoster, type MatchResult } from '@scoresphere/contracts';
import {
  type CommandDescriptor,
  type DomainFact,
  err,
  type MetricRecord,
  ok,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { badmintonRuleCatalogue, badmintonRuleVariables } from './rules.js';
import { badmintonPresets, badmintonSettingsSchema, type BadmintonSettings } from './settings.js';

/**
 * Badminton engine, version 1. Service follows the BWF Laws:
 * - the server serves from the right service court when their side's score is even, and
 *   from the left when it is odd;
 * - a side that wins a rally on its own serve scores and the same server serves again
 *   from the other court (in doubles the server's pair swap courts);
 * - a receiving side that wins a rally scores and serves next; in doubles nobody moves,
 *   and whoever stands in the court that matches their new score serves;
 * - the winner of a game serves first in the next game.
 */

export type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const badmintonCommandSchema = z.discriminatedUnion('type', [
  /** Opens a game. In doubles the scorer names the first server and receiver. */
  z.object({
    type: z.literal('start_game'),
    servingSide: sideSchema,
    serverId: idSchema.optional(),
    receiverId: idSchema.optional(),
  }),
  z.object({ type: z.literal('rally'), winner: sideSchema }),
  /** Ends the match early; the other side wins. */
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['retired', 'walkover', 'disqualified']),
  }),
]);
export type BadmintonCommand = z.infer<typeof badmintonCommandSchema>;

export interface GameScore {
  points: [number, number];
  winner: Side | null;
}

export type FinishMethod = 'played' | 'retired' | 'walkover' | 'disqualified';

export interface BadmintonState {
  config: BadmintonSettings;
  players: [string[], string[]];
  /** Finished games plus the current one, which is last. */
  games: GameScore[];
  phase: 'awaiting_service' | 'rallying' | 'complete';
  servingSide: Side | null;
  serverId: string | null;
  /** Who stands in each side's right service court (doubles); singles players never swap. */
  rightCourt: [string, string] | null;
  /** Set between games: the previous game's winner serves first (BWF Law 7.6). */
  nextServingSide: Side | null;
  outcome: { winner: Side; method: FinishMethod } | null;
  rallies: number;
  streak: { side: Side | null; length: number };
  longestStreak: [number, number];
  /** Points won by each side while it was serving. */
  servicePoints: [number, number];
  /** Points won while each player was the server, keyed by participant ID. */
  servicePointsByPlayer: Record<string, number>;
}

const other = (side: Side): Side => (side === 0 ? 1 : 0);

export function currentGame(state: BadmintonState): GameScore {
  return state.games[state.games.length - 1]!;
}

export function gamesWon(state: BadmintonState): [number, number] {
  const won: [number, number] = [0, 0];
  for (const g of state.games) if (g.winner !== null) won[g.winner]++;
  return won;
}

/** Whether the current game decides the match (both sides one game short). */
export function isDecidingGame(state: BadmintonState): boolean {
  const [a, b] = gamesWon(state);
  const need = state.config.gamesToWin - 1;
  return need > 0 && a === need && b === need;
}

function partner(state: BadmintonState, side: Side, playerId: string): string {
  return state.players[side].find((p) => p !== playerId) ?? playerId;
}

/** The player of `side` standing in the given service court. */
function inCourt(state: BadmintonState, side: Side, court: 'right' | 'left'): string {
  const right = state.rightCourt ? state.rightCourt[side] : state.players[side][0]!;
  if (state.config.discipline === 'singles') return state.players[side][0]!;
  return court === 'right' ? right : partner(state, side, right);
}

export interface ServiceView {
  servingSide: Side;
  serverId: string;
  receiverId: string;
  court: 'right' | 'left';
}

/** Who serves to whom, and from which court, for the next rally. */
export function serviceView(state: BadmintonState): ServiceView | null {
  if (state.phase !== 'rallying' || state.servingSide === null || state.serverId === null) {
    return null;
  }
  const side = state.servingSide;
  const court = currentGame(state).points[side] % 2 === 0 ? 'right' : 'left';
  return {
    servingSide: side,
    serverId: state.serverId,
    receiverId: inCourt(state, other(side), court),
    court,
  };
}

function gameWinner(config: BadmintonSettings, points: [number, number]): Side | null {
  for (const side of [0, 1] as const) {
    const mine = points[side];
    const theirs = points[other(side)];
    if (config.cap !== null && mine >= config.cap) return side;
    if (mine >= config.pointsToWin && mine - theirs >= config.winBy) return side;
  }
  return null;
}

function init(config: BadmintonSettings, roster: MatchRoster): BadmintonState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    games: [{ points: [0, 0], winner: null }],
    phase: 'awaiting_service',
    servingSide: null,
    serverId: null,
    rightCourt: null,
    nextServingSide: null,
    outcome: null,
    rallies: 0,
    streak: { side: null, length: 0 },
    longestStreak: [0, 0],
    servicePoints: [0, 0],
    servicePointsByPlayer: {},
  };
}

function validate(state: BadmintonState, cmd: BadmintonCommand) {
  const fail = (code: string, message: string) => err({ code, message });
  switch (cmd.type) {
    case 'start_game': {
      if (state.phase !== 'awaiting_service')
        return fail('GAME_IN_PROGRESS', 'A game is already under way.');
      if (state.nextServingSide !== null && cmd.servingSide !== state.nextServingSide) {
        return fail('WINNER_SERVES_FIRST', 'The side that won the last game serves first.');
      }
      const receiving = other(cmd.servingSide);
      if (state.config.discipline === 'doubles') {
        if (!cmd.serverId || !state.players[cmd.servingSide].includes(cmd.serverId)) {
          return fail('PICK_SERVER', 'Choose who serves first.');
        }
        if (!cmd.receiverId || !state.players[receiving].includes(cmd.receiverId)) {
          return fail('PICK_RECEIVER', 'Choose who receives first.');
        }
      } else {
        if (cmd.serverId && cmd.serverId !== state.players[cmd.servingSide][0]) {
          return fail('PICK_SERVER', 'The server must play for the serving side.');
        }
        if (cmd.receiverId && cmd.receiverId !== state.players[receiving][0]) {
          return fail('PICK_RECEIVER', 'The receiver must play for the other side.');
        }
      }
      return ok(undefined);
    }
    case 'rally':
      return state.phase === 'rallying'
        ? ok(undefined)
        : fail(
            'NO_GAME',
            state.phase === 'complete' ? 'The match is over.' : 'Start the game first.',
          );
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

function apply(
  state: BadmintonState,
  cmd: BadmintonCommand,
): { state: BadmintonState; facts: DomainFact[] } {
  switch (cmd.type) {
    case 'start_game':
      return startGame(state, cmd);
    case 'rally':
      return rally(state, cmd.winner);
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...state,
          phase: 'complete',
          servingSide: null,
          serverId: null,
          outcome: { winner, method: cmd.reason },
        },
        facts: [{ type: 'match_won', data: { side: winner, method: cmd.reason } }],
      };
    }
  }
}

function startGame(
  state: BadmintonState,
  cmd: Extract<BadmintonCommand, { type: 'start_game' }>,
): { state: BadmintonState; facts: DomainFact[] } {
  const serving = cmd.servingSide;
  const receiving = other(serving);
  const serverId = cmd.serverId ?? state.players[serving][0]!;
  const receiverId = cmd.receiverId ?? state.players[receiving][0]!;
  // At love-all the server and receiver both stand in their right service courts.
  const rightCourt: [string, string] =
    serving === 0 ? [serverId, receiverId] : [receiverId, serverId];
  return {
    state: {
      ...state,
      phase: 'rallying',
      servingSide: serving,
      serverId,
      rightCourt,
      nextServingSide: null,
      // Runs of points are counted within a game.
      streak: { side: null, length: 0 },
    },
    facts: [{ type: 'game_started', data: { game: state.games.length, servingSide: serving } }],
  };
}

function rally(
  state: BadmintonState,
  winner: Side,
): { state: BadmintonState; facts: DomainFact[] } {
  const config = state.config;
  const game = currentGame(state);
  const points: [number, number] = [...game.points];
  points[winner]++;
  const facts: DomainFact[] = [{ type: 'point', data: { side: winner, score: [...points] } }];

  const servedBy = state.servingSide!;
  const server = state.serverId!;
  let rightCourt = state.rightCourt;
  let serverId = server;
  const servicePoints: [number, number] = [...state.servicePoints];
  let servicePointsByPlayer = state.servicePointsByPlayer;

  if (winner === servedBy) {
    servicePoints[winner]++;
    servicePointsByPlayer = {
      ...servicePointsByPlayer,
      [server]: (servicePointsByPlayer[server] ?? 0) + 1,
    };
    if (config.discipline === 'doubles' && rightCourt) {
      // The server's pair swap service courts; the same player serves again.
      const swapped: [string, string] = [...rightCourt];
      swapped[winner] = partner(state, winner, rightCourt[winner]);
      rightCourt = swapped;
    }
  } else {
    // Service passes to the rally winner; the player in the court for their score serves.
    const court = points[winner] % 2 === 0 ? 'right' : 'left';
    serverId = inCourt({ ...state, rightCourt }, winner, court);
  }

  const streak =
    state.streak.side === winner
      ? { side: winner, length: state.streak.length + 1 }
      : { side: winner, length: 1 };
  const longestStreak: [number, number] = [...state.longestStreak];
  longestStreak[winner] = Math.max(longestStreak[winner], streak.length);

  const leading = Math.max(...points);
  const otherScore = Math.min(...points);
  if (
    config.intervalAt !== null &&
    leading === config.intervalAt &&
    otherScore < config.intervalAt &&
    points[winner] === leading
  ) {
    facts.push({ type: 'interval', data: { score: [...points] } });
  }
  if (
    config.deciderChangeEndsAt !== null &&
    isDecidingGame(state) &&
    points[winner] === config.deciderChangeEndsAt &&
    points[other(winner)] < config.deciderChangeEndsAt
  ) {
    facts.push({ type: 'change_ends', data: { reason: 'decider' } });
  }

  const games = [...state.games.slice(0, -1), { points, winner: gameWinner(config, points) }];
  let next: BadmintonState = {
    ...state,
    games,
    servingSide: winner,
    serverId,
    rightCourt,
    rallies: state.rallies + 1,
    streak,
    longestStreak,
    servicePoints,
    servicePointsByPlayer,
  };

  if (games[games.length - 1]!.winner !== null) {
    facts.push({
      type: 'game_won',
      data: { side: winner, game: games.length, score: [...points] },
    });
    const won = gamesWon(next);
    if (won[winner] >= config.gamesToWin) {
      next = {
        ...next,
        phase: 'complete',
        servingSide: null,
        serverId: null,
        outcome: { winner, method: 'played' },
      };
      facts.push({ type: 'match_won', data: { side: winner, method: 'played' } });
    } else {
      next = {
        ...next,
        games: [...games, { points: [0, 0], winner: null }],
        phase: 'awaiting_service',
        servingSide: null,
        serverId: null,
        nextServingSide: winner,
      };
      facts.push({ type: 'change_ends', data: { reason: 'game_end' } });
    }
  }
  return { state: next, facts };
}

function commands(state: BadmintonState): CommandDescriptor[] {
  switch (state.phase) {
    case 'awaiting_service':
      return [
        { type: 'start_game', label: 'Start game' },
        { type: 'concede', label: 'End match early' },
      ];
    case 'rallying':
      return [
        { type: 'rally', label: 'Rally won' },
        { type: 'concede', label: 'End match early' },
      ];
    case 'complete':
      return [];
  }
}

/** Game scores from the winner's point of view are not used; scores are always side 0 – side 1. */
export function scoreLine(state: BadmintonState): string {
  return state.games
    .filter((g) => g.winner !== null || g.points[0] + g.points[1] > 0)
    .map((g) => `${g.points[0]}–${g.points[1]}`)
    .join(', ');
}

const METHOD_LABEL: Record<FinishMethod, string> = {
  played: '',
  retired: 'retired',
  walkover: 'walkover',
  disqualified: 'disqualified',
};

function result(state: BadmintonState): MatchResult {
  const line = scoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const method = METHOD_LABEL[state.outcome.method];
  const summary = !method
    ? line
    : line
      ? `${line} (${method})`
      : method[0]!.toUpperCase() + method.slice(1);
  return { status: 'won', winnerSide: state.outcome.winner, summary };
}

function stats(state: BadmintonState): MetricRecord[] {
  const won = gamesWon(state);
  const pointsWon: [number, number] = [0, 0];
  for (const g of state.games) {
    pointsWon[0] += g.points[0];
    pointsWon[1] += g.points[1];
  }
  const records: MetricRecord[] = [];
  for (const side of [0, 1] as const) {
    records.push(
      { metric: 'games_won', value: won[side], side },
      { metric: 'points_won', value: pointsWon[side], side },
      { metric: 'service_points_won', value: state.servicePoints[side], side },
      { metric: 'receiving_points_won', value: pointsWon[side] - state.servicePoints[side], side },
      { metric: 'longest_streak', value: state.longestStreak[side], side },
    );
    for (const participantId of state.players[side]) {
      records.push({
        metric: 'service_points_won',
        value: state.servicePointsByPlayer[participantId] ?? 0,
        participantId,
        side,
      });
    }
  }
  return records;
}

function validateSetup(config: BadmintonSettings, roster: MatchRoster) {
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
  if (new Set(all).size !== all.length) {
    return err({ code: 'DUPLICATE_PLAYER', message: 'A player can only appear once.' });
  }
  return ok(undefined);
}

export const badmintonEngine: SportEngine<BadmintonState, BadmintonSettings, BadmintonCommand> = {
  sport: 'badminton',
  version: 1,
  settingsSchema: badmintonSettingsSchema,
  commandSchema: badmintonCommandSchema,
  presets: badmintonPresets.map((p) => ({
    ...p,
    config: { ...p.config, discipline: 'singles' as const },
  })),
  validateSetup,
  init,
  commands,
  validate,
  apply: (state, cmd) => apply(state, cmd),
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: badmintonRuleCatalogue,
  ruleVariables: badmintonRuleVariables,
};
