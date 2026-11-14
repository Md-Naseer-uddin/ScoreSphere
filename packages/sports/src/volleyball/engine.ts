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
import { volleyballRuleCatalogue, volleyballRuleVariables } from './rules.js';
import {
  volleyballPresets,
  type VolleyballSettings,
  volleyballSettingsSchema,
} from './settings.js';

/**
 * Volleyball engine, version 1, following the FIVB Official Volleyball Rules:
 * - rally scoring: every rally scores a point;
 * - a team that wins the serve back rotates one position clockwise, and the player who
 *   moves into position I serves;
 * - sets go to `pointsPerSet` (the deciding set to `decidingSetPoints`) with a two-point lead;
 * - in sets after the first, the team that did not serve first in the previous set
 *   serves first; the deciding set has a new toss.
 *
 * Point credits (attack, block, ace) are optional; awards appear only when they are recorded.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const POINT_KINDS = ['attack', 'block', 'ace'] as const;
export type PointKind = (typeof POINT_KINDS)[number];

export const volleyballCommandSchema = z.discriminatedUnion('type', [
  /** Opens a set: who serves, and each team's line-up in rotation order (position I first). */
  z.object({
    type: z.literal('start_set'),
    servingSide: sideSchema,
    lineups: z.tuple([z.array(idSchema), z.array(idSchema)]),
  }),
  z.object({
    type: z.literal('rally'),
    winner: sideSchema,
    /** Who won the point and how, when the scorer records it. */
    credit: z.object({ playerId: idSchema, kind: z.enum(POINT_KINDS) }).optional(),
  }),
  z.object({ type: z.literal('substitute'), side: sideSchema, outId: idSchema, inId: idSchema }),
  z.object({ type: z.literal('timeout'), side: sideSchema }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['retired', 'walkover', 'forfeit']),
  }),
]);
export type VolleyballCommand = z.infer<typeof volleyballCommandSchema>;

export interface VolleyballSet {
  points: [number, number];
  winner: Side | null;
  firstServer: Side;
}

export interface VolleyballState {
  config: VolleyballSettings;
  players: [string[], string[]];
  phase: 'awaiting_set' | 'rallying' | 'complete';
  sets: VolleyballSet[];
  serving: Side | null;
  /** Players on court in rotation order; index 0 is position I, the server's position. */
  lineups: [string[], string[]] | null;
  substitutionsUsed: [number, number];
  timeoutsUsed: [number, number];
  outcome: { winner: Side; method: 'played' | 'retired' | 'walkover' | 'forfeit' } | null;
  /** Points credited to players, by kind. */
  credits: Record<string, Record<PointKind, number>>;
  sideOuts: [number, number];
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const pair = (): [number, number] => [0, 0];
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export function volleyballSetsWon(state: VolleyballState): [number, number] {
  const won = pair();
  for (const s of state.sets) if (s.winner !== null) won[s.winner]++;
  return won;
}

/** The set that decides the match (both teams one set short); in a one-set match, that set. */
export function volleyballIsDecidingSet(state: VolleyballState): boolean {
  const [a, b] = volleyballSetsWon(state);
  const need = state.config.setsToWin - 1;
  return a === need && b === need;
}

export function volleyballCurrentSet(state: VolleyballState): VolleyballSet | null {
  const last = state.sets[state.sets.length - 1];
  return last && last.winner === null ? last : null;
}

export function volleyballServer(state: VolleyballState): string | null {
  if (state.phase !== 'rallying' || state.serving === null || !state.lineups) return null;
  return state.lineups[state.serving][0] ?? null;
}

/** Who must serve first in the next set; null when there is a free choice (toss). */
export function volleyballNextFirstServer(state: VolleyballState): Side | null {
  const last = state.sets[state.sets.length - 1];
  if (!last || volleyballIsDecidingSet(state)) return null;
  return other(last.firstServer);
}

function init(config: VolleyballSettings, roster: MatchRoster): VolleyballState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'awaiting_set',
    sets: [],
    serving: null,
    lineups: null,
    substitutionsUsed: pair(),
    timeoutsUsed: pair(),
    outcome: null,
    credits: {},
    sideOuts: pair(),
  };
}

function validateSetup(config: VolleyballSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length < config.playersOnCourt) {
      return fail('SIDE_SIZE', `Each team needs at least ${config.playersOnCourt} players.`);
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function validate(state: VolleyballState, cmd: VolleyballCommand): Result<void, EngineError> {
  const { config } = state;
  switch (cmd.type) {
    case 'start_set': {
      if (state.phase !== 'awaiting_set')
        return fail('SET_IN_PROGRESS', 'A set is already under way.');
      const required = volleyballNextFirstServer(state);
      if (required !== null && cmd.servingSide !== required) {
        return fail(
          'SERVE_ORDER',
          'The team that received first in the last set serves first now.',
        );
      }
      for (const side of [0, 1] as const) {
        const lineup = cmd.lineups[side];
        if (lineup.length !== config.playersOnCourt || new Set(lineup).size !== lineup.length) {
          return fail('LINEUP', `Each line-up needs ${config.playersOnCourt} different players.`);
        }
        if (!lineup.every((id) => state.players[side].includes(id))) {
          return fail('LINEUP', 'A line-up can only include that team’s players.');
        }
      }
      return ok(undefined);
    }
    case 'rally': {
      if (state.phase !== 'rallying') {
        return fail(
          'NO_SET',
          state.phase === 'complete' ? 'The match is over.' : 'Start the set first.',
        );
      }
      if (cmd.credit && !state.lineups![cmd.winner].includes(cmd.credit.playerId)) {
        return fail('CREDIT', 'Credit the point to a player on court for the team that won it.');
      }
      if (cmd.credit?.kind === 'ace' && cmd.winner !== state.serving) {
        return fail('CREDIT', 'Only the serving team can score an ace.');
      }
      if (cmd.credit?.kind === 'ace' && cmd.credit.playerId !== volleyballServer(state)) {
        return fail('CREDIT', 'An ace is credited to the server.');
      }
      return ok(undefined);
    }
    case 'substitute': {
      if (state.phase !== 'rallying')
        return fail('NOT_NOW', 'Substitutions are made during a set.');
      const court = state.lineups![cmd.side];
      if (!court.includes(cmd.outId)) return fail('NOT_ON_COURT', 'That player is not on court.');
      if (!state.players[cmd.side].includes(cmd.inId) || court.includes(cmd.inId)) {
        return fail('NOT_ON_BENCH', 'Choose a player from that team’s bench.');
      }
      const limit = config.substitutionsPerSet;
      if (limit !== null && state.substitutionsUsed[cmd.side] >= limit) {
        return fail('SUB_LIMIT', `Only ${limit} substitutions per set.`);
      }
      return ok(undefined);
    }
    case 'timeout':
      if (state.phase !== 'rallying') return fail('NOT_NOW', 'Timeouts are taken during a set.');
      return state.timeoutsUsed[cmd.side] < config.timeoutsPerSet
        ? ok(undefined)
        : fail('TIMEOUT_LIMIT', `Only ${config.timeoutsPerSet} timeouts per set.`);
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

/** Clockwise rotation: the player in position II moves to position I and serves. */
function rotate(lineup: string[]): string[] {
  return [...lineup.slice(1), lineup[0]!];
}

function setWinner(
  config: VolleyballSettings,
  deciding: boolean,
  points: [number, number],
): Side | null {
  const target = deciding ? config.decidingSetPoints : config.pointsPerSet;
  for (const side of [0, 1] as const) {
    const [p, q] = [points[side], points[other(side)]];
    if (config.cap !== null && p >= config.cap) return side;
    if (p >= target && p - q >= config.winBy) return side;
  }
  return null;
}

function apply(
  state: VolleyballState,
  cmd: VolleyballCommand,
): { state: VolleyballState; facts: DomainFact[] } {
  switch (cmd.type) {
    case 'start_set':
      return {
        state: {
          ...state,
          phase: 'rallying',
          sets: [...state.sets, { points: pair(), winner: null, firstServer: cmd.servingSide }],
          serving: cmd.servingSide,
          lineups: [[...cmd.lineups[0]], [...cmd.lineups[1]]],
          substitutionsUsed: pair(),
          timeoutsUsed: pair(),
        },
        facts: [{ type: 'set_started', data: { set: state.sets.length + 1 } }],
      };
    case 'rally':
      return rally(state, cmd);
    case 'substitute': {
      const lineups: [string[], string[]] = [[...state.lineups![0]], [...state.lineups![1]]];
      const court = lineups[cmd.side];
      court[court.indexOf(cmd.outId)] = cmd.inId;
      const used: [number, number] = [...state.substitutionsUsed];
      used[cmd.side]++;
      return {
        state: { ...state, lineups, substitutionsUsed: used },
        facts: [{ type: 'substitution' }],
      };
    }
    case 'timeout': {
      const used: [number, number] = [...state.timeoutsUsed];
      used[cmd.side]++;
      return {
        state: { ...state, timeoutsUsed: used },
        facts: [{ type: 'timeout', data: { side: cmd.side } }],
      };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: { ...state, phase: 'complete', outcome: { winner, method: cmd.reason } },
        facts: [{ type: 'match_won', data: { side: winner, method: cmd.reason } }],
      };
    }
  }
}

function rally(
  state: VolleyballState,
  cmd: Extract<VolleyballCommand, { type: 'rally' }>,
): { state: VolleyballState; facts: DomainFact[] } {
  const { config } = state;
  const winner = cmd.winner;
  const set = {
    ...volleyballCurrentSet(state)!,
    points: [...volleyballCurrentSet(state)!.points] as [number, number],
  };
  set.points[winner]++;
  const facts: DomainFact[] = [{ type: 'point', data: { side: winner, score: [...set.points] } }];

  let lineups = state.lineups!;
  const sideOuts: [number, number] = [...state.sideOuts];
  if (winner !== state.serving) {
    // Side-out: the receiving team gains the serve and rotates.
    lineups = winner === 0 ? [rotate(lineups[0]), lineups[1]] : [lineups[0], rotate(lineups[1])];
    sideOuts[winner]++;
  }

  let credits = state.credits;
  if (cmd.credit) {
    const mine = credits[cmd.credit.playerId] ?? { attack: 0, block: 0, ace: 0 };
    credits = {
      ...credits,
      [cmd.credit.playerId]: { ...mine, [cmd.credit.kind]: mine[cmd.credit.kind] + 1 },
    };
  }

  const deciding = volleyballIsDecidingSet(state);
  if (
    deciding &&
    config.deciderChangeEndsAt !== null &&
    set.points[winner] === config.deciderChangeEndsAt &&
    set.points[other(winner)] < config.deciderChangeEndsAt
  ) {
    facts.push({ type: 'change_ends', data: { reason: 'decider' } });
  }

  set.winner = setWinner(config, deciding, set.points);
  let next: VolleyballState = {
    ...state,
    sets: [...state.sets.slice(0, -1), set],
    serving: winner,
    lineups,
    credits,
    sideOuts,
  };
  if (set.winner === null) return { state: next, facts };

  facts.push({
    type: 'set_won',
    data: { side: winner, set: next.sets.length, score: [...set.points] },
  });
  if (volleyballSetsWon(next)[winner] >= config.setsToWin) {
    facts.push({ type: 'match_won', data: { side: winner, method: 'played' } });
    next = { ...next, phase: 'complete', serving: null, outcome: { winner, method: 'played' } };
  } else {
    next = { ...next, phase: 'awaiting_set', serving: null };
  }
  return { state: next, facts };
}

function commands(state: VolleyballState): CommandDescriptor[] {
  switch (state.phase) {
    case 'awaiting_set':
      return [
        { type: 'start_set', label: 'Start set' },
        { type: 'concede', label: 'End match early' },
      ];
    case 'rallying':
      return [
        { type: 'rally', label: 'Rally won' },
        { type: 'substitute', label: 'Substitution' },
        { type: 'timeout', label: 'Timeout' },
        { type: 'concede', label: 'End match early' },
      ];
    case 'complete':
      return [];
  }
}

export function volleyballScoreLine(state: VolleyballState): string {
  return state.sets
    .filter((s) => s.winner !== null || s.points[0] + s.points[1] > 0)
    .map((s) => `${s.points[0]}–${s.points[1]}`)
    .join(', ');
}

function result(state: VolleyballState): MatchResult {
  const line = volleyballScoreLine(state);
  if (!state.outcome) return { status: 'in_progress', summary: line };
  const label = state.outcome.method === 'played' ? '' : state.outcome.method;
  const summary = !label
    ? line
    : line
      ? `${line} (${label})`
      : label[0]!.toUpperCase() + label.slice(1);
  return { status: 'won', winnerSide: state.outcome.winner, summary };
}

function stats(state: VolleyballState): MetricRecord[] {
  const won = volleyballSetsWon(state);
  const points = pair();
  for (const s of state.sets) {
    points[0] += s.points[0];
    points[1] += s.points[1];
  }
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => [
    { metric: 'sets_won', value: won[side], side },
    { metric: 'points_won', value: points[side], side },
    { metric: 'side_outs', value: state.sideOuts[side], side },
  ]);
  for (const [participantId, c] of Object.entries(state.credits)) {
    const side = state.players[0].includes(participantId) ? 0 : 1;
    records.push(
      { metric: 'attack_points', value: c.attack, participantId, side },
      { metric: 'block_points', value: c.block, participantId, side },
      { metric: 'service_aces', value: c.ace, participantId, side },
      { metric: 'points_scored', value: c.attack + c.block + c.ace, participantId, side },
    );
  }
  return records;
}

export const volleyballEngine: SportEngine<VolleyballState, VolleyballSettings, VolleyballCommand> =
  {
    sport: 'volleyball',
    version: 1,
    settingsSchema: volleyballSettingsSchema,
    commandSchema: volleyballCommandSchema,
    presets: volleyballPresets,
    validateSetup,
    init,
    commands,
    validate,
    apply,
    isComplete: (state) => state.phase === 'complete',
    result,
    stats,
    ruleCatalogue: volleyballRuleCatalogue,
    ruleVariables: volleyballRuleVariables,
  };
