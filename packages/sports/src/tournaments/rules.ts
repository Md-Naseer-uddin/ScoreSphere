import type { SportKey } from '@scoresphere/contracts';
import type { MetricRecord } from '@scoresphere/engine-kit';
import type { BadmintonState } from '../badminton/engine.js';
import type { BasketballState } from '../basketball/engine.js';
import type { CricketState } from '../cricket/engine.js';
import type { HockeyState } from '../field-hockey/engine.js';
import type { FootballState } from '../football/engine.js';
import type { KabaddiState } from '../kabaddi/engine.js';
import type { KhoKhoState } from '../kho-kho/engine.js';
import type { TennisState } from '../tennis/engine.js';
import type { VolleyballState } from '../volleyball/engine.js';
import { classificationPoints, type WrestlingState } from '../wrestling/engine.js';
import type { StandingsPoints } from './standings.js';

/** A player award decided by one summed statistic over the tournament. */
export interface PlayerAwardRule {
  key: string;
  name: string;
  /** Plain-language criteria, including tie-breaks. Proposed defaults, owner signs off. */
  criteria: string;
  metric: string;
  /** Used when the metric is level; lower is better when `lowerIsBetter`. */
  tieBreak?: { metric: string; lowerIsBetter: boolean };
}

/**
 * How a sport plays out in a tournament: points, tie-breaks, the totals each match adds
 * to a side's record, leaderboards and player awards (plan M7).
 */
export interface TournamentRules {
  points: StandingsPoints;
  /** Default tie-break order; organizers may reorder from `allowedTieBreaks`. */
  tieBreaks: string[];
  allowedTieBreaks: string[];
  /** Whether a match can end level (counts as a draw in a league). */
  allowsDraws: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totals: (state: any, side: 0 | 1) => Record<string, number>;
  leaderboards: { metric: string; label: string }[];
  playerAwards: PlayerAwardRule[];
  /** Metrics computed from a player's summed totals (e.g. cricket impact points). */
  derive?: (totals: Record<string, number>) => Record<string, number>;
}

function cricketTotals(state: CricketState, side: 0 | 1) {
  const t = { runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 };
  for (const inn of state.innings.filter((i) => !i.superOver)) {
    // ICC: a side bowled out is taken to have faced its full quota of overs.
    const balls = inn.wickets >= inn.maxWickets ? inn.maxBalls : inn.legalBalls;
    if (inn.battingSide === side) {
      t.runsFor += inn.runs;
      t.ballsFaced += balls;
    } else {
      t.runsAgainst += inn.runs;
      t.ballsBowled += balls;
    }
  }
  return t;
}

function gamesAndPoints(
  games: { points: [number, number]; winner: 0 | 1 | null }[],
  side: 0 | 1,
  prefix: 'games' | 'sets',
) {
  const other = side === 0 ? 1 : 0;
  return {
    [`${prefix}For`]: games.filter((g) => g.winner === side).length,
    [`${prefix}Against`]: games.filter((g) => g.winner === other).length,
    pointsFor: games.reduce((s, g) => s + g.points[side], 0),
    pointsAgainst: games.reduce((s, g) => s + g.points[other], 0),
  };
}

function tennisTotals(state: TennisState, side: 0 | 1) {
  const other = side === 0 ? 1 : 0;
  const sets = state.sets.filter((s) => s.winner !== null);
  const counted = state.sets.filter((s) => !s.matchTiebreak);
  return {
    setsFor: sets.filter((s) => s.winner === side).length,
    setsAgainst: sets.filter((s) => s.winner === other).length,
    gamesFor: counted.reduce((n, s) => n + s.games[side], 0),
    gamesAgainst: counted.reduce((n, s) => n + s.games[other], 0),
  };
}

const RULES: Partial<Record<SportKey, TournamentRules>> = {
  cricket: {
    points: { win: 2, draw: 1, loss: 0 },
    tieBreaks: ['wins', 'net_run_rate'],
    allowedTieBreaks: ['wins', 'net_run_rate'],
    allowsDraws: true,
    totals: cricketTotals,
    derive: (t) => ({
      impact_points:
        (t.runs ?? 0) +
        20 * (t.wickets ?? 0) +
        10 * ((t.catches ?? 0) + (t.stumpings ?? 0) + (t.run_outs ?? 0)),
    }),
    leaderboards: [
      { metric: 'runs', label: 'Most runs' },
      { metric: 'wickets', label: 'Most wickets' },
      { metric: 'sixes', label: 'Most sixes' },
      { metric: 'catches', label: 'Most catches' },
    ],
    playerAwards: [
      {
        key: 'player-of-the-tournament',
        name: 'Player of the Tournament',
        criteria:
          'Most impact points over the tournament (runs + 20 per wicket + 10 per catch, stumping or run-out); still level, shared.',
        metric: 'impact_points',
      },
      {
        key: 'best-batter',
        name: 'Best Batter',
        criteria: 'Most runs; then fewest balls faced; still level, shared.',
        metric: 'runs',
        tieBreak: { metric: 'balls_faced', lowerIsBetter: true },
      },
      {
        key: 'best-bowler',
        name: 'Best Bowler',
        criteria: 'Most wickets; then fewest runs conceded; still level, shared.',
        metric: 'wickets',
        tieBreak: { metric: 'runs_conceded', lowerIsBetter: true },
      },
    ],
  },
  badminton: {
    points: { win: 1, draw: 0, loss: 0 },
    tieBreaks: ['game_difference', 'point_difference'],
    allowedTieBreaks: ['game_difference', 'point_difference'],
    allowsDraws: false,
    totals: (state: BadmintonState, side) => gamesAndPoints(state.games, side, 'games'),
    leaderboards: [],
    playerAwards: [],
  },
  tennis: {
    points: { win: 1, draw: 0, loss: 0 },
    tieBreaks: ['set_difference', 'game_difference'],
    allowedTieBreaks: ['set_difference', 'game_difference'],
    allowsDraws: false,
    totals: tennisTotals,
    leaderboards: [],
    playerAwards: [],
  },
  volleyball: {
    points: { win: 2, draw: 0, loss: 0 },
    tieBreaks: ['wins', 'set_ratio', 'point_ratio'],
    allowedTieBreaks: ['wins', 'set_ratio', 'point_ratio', 'set_difference', 'point_difference'],
    allowsDraws: false,
    totals: (state: VolleyballState, side) => gamesAndPoints(state.sets, side, 'sets'),
    leaderboards: [
      { metric: 'points_scored', label: 'Most points' },
      { metric: 'attack_points', label: 'Most attack points' },
      { metric: 'block_points', label: 'Most blocks' },
      { metric: 'service_aces', label: 'Most aces' },
    ],
    playerAwards: [
      {
        key: 'mvp',
        name: 'Tournament MVP',
        criteria:
          'Most points scored (attacks, blocks and aces) over the tournament; still level, shared. Needs point credits.',
        metric: 'points_scored',
      },
    ],
  },
  football: {
    points: { win: 3, draw: 1, loss: 0 },
    tieBreaks: ['goal_difference', 'goals_for'],
    allowedTieBreaks: ['goal_difference', 'goals_for', 'wins'],
    allowsDraws: true,
    // Shootout goals decide a knockout tie but don't count as goals (Law 10).
    totals: (state: FootballState, side) => ({
      goalsFor: state.score[side],
      goalsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    derive: (t) => ({ impact_points: 2 * (t.goals ?? 0) + (t.assists ?? 0) }),
    leaderboards: [
      { metric: 'goals', label: 'Top scorers' },
      { metric: 'assists', label: 'Most assists' },
    ],
    playerAwards: [
      {
        key: 'player-of-the-tournament',
        name: 'Player of the Tournament',
        criteria:
          'Most impact points over the tournament (2 per goal, 1 per assist); still level, shared.',
        metric: 'impact_points',
      },
      {
        key: 'golden-boot',
        name: 'Golden Boot',
        criteria: 'Most goals (not own goals); then most assists; still level, shared.',
        metric: 'goals',
        tieBreak: { metric: 'assists', lowerIsBetter: false },
      },
    ],
  },
  'field-hockey': {
    points: { win: 3, draw: 1, loss: 0 },
    tieBreaks: ['goal_difference', 'goals_for'],
    allowedTieBreaks: ['goal_difference', 'goals_for', 'wins'],
    allowsDraws: true,
    // A shoot-out decides a winner, but its goals aren't match goals.
    totals: (state: HockeyState, side) => ({
      goalsFor: state.score[side],
      goalsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    derive: (t) => ({ impact_points: 2 * (t.goals ?? 0) + (t.assists ?? 0) }),
    leaderboards: [
      { metric: 'goals', label: 'Top scorers' },
      { metric: 'assists', label: 'Most assists' },
      { metric: 'penalty_corner_goals', label: 'Most penalty-corner goals' },
    ],
    playerAwards: [
      {
        key: 'player-of-the-tournament',
        name: 'Player of the Tournament',
        criteria:
          'Most impact points over the tournament (2 per goal, 1 per assist); still level, shared.',
        metric: 'impact_points',
      },
      {
        key: 'top-scorer',
        name: 'Top Scorer',
        criteria: 'Most goals; then most assists; still level, shared.',
        metric: 'goals',
        tieBreak: { metric: 'assists', lowerIsBetter: false },
      },
    ],
  },
  basketball: {
    // FIBA: 2 points for a win, 1 for a loss. Games can't end level.
    points: { win: 2, draw: 1, loss: 1 },
    tieBreaks: ['point_difference'],
    allowedTieBreaks: ['point_difference', 'wins'],
    allowsDraws: false,
    totals: (state: BasketballState, side) => ({
      pointsFor: state.score[side],
      pointsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    derive: (t) => ({
      efficiency:
        (t.points ?? 0) +
        (t.rebounds ?? 0) +
        (t.assists ?? 0) +
        (t.steals ?? 0) +
        (t.blocks ?? 0) -
        (t.turnovers ?? 0) -
        (t.missed_shots ?? 0),
    }),
    leaderboards: [
      { metric: 'points', label: 'Top scorers' },
      { metric: 'rebounds', label: 'Most rebounds' },
      { metric: 'assists', label: 'Most assists' },
      { metric: 'three_pointers', label: 'Most three-pointers' },
    ],
    playerAwards: [
      {
        key: 'mvp',
        name: 'Tournament MVP',
        criteria:
          'Highest efficiency over the tournament (points + rebounds + assists + steals + blocks − turnovers − missed shots); still level, shared.',
        metric: 'efficiency',
      },
      {
        key: 'top-scorer',
        name: 'Top Scorer',
        criteria: 'Most points; still level, shared.',
        metric: 'points',
      },
      {
        key: 'rebounds-leader',
        name: 'Rebounds Leader',
        criteria: 'Most rebounds; still level, shared. Needs rebounds recorded.',
        metric: 'rebounds',
      },
      {
        key: 'assists-leader',
        name: 'Assists Leader',
        criteria: 'Most assists; still level, shared. Needs assists recorded.',
        metric: 'assists',
      },
    ],
  },
  kabaddi: {
    points: { win: 2, draw: 1, loss: 0 },
    tieBreaks: ['point_difference'],
    allowedTieBreaks: ['point_difference', 'wins'],
    allowsDraws: true,
    totals: (state: KabaddiState, side) => ({
      pointsFor: state.score[side],
      pointsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    derive: (t) => ({ total_points: (t.raid_points ?? 0) + (t.tackle_points ?? 0) }),
    leaderboards: [
      { metric: 'raid_points', label: 'Most raid points' },
      { metric: 'tackle_points', label: 'Most tackle points' },
      { metric: 'super_raids', label: 'Most super raids' },
      { metric: 'super_tackles', label: 'Most super tackles' },
    ],
    playerAwards: [
      {
        key: 'player-of-the-tournament',
        name: 'Player of the Tournament',
        criteria: 'Most raid points plus tackle points over the tournament; still level, shared.',
        metric: 'total_points',
      },
      {
        key: 'best-raider',
        name: 'Best Raider',
        criteria: 'Most raid points; then most super raids; still level, shared.',
        metric: 'raid_points',
        tieBreak: { metric: 'super_raids', lowerIsBetter: false },
      },
      {
        key: 'best-defender',
        name: 'Best Defender',
        criteria: 'Most tackle points; then most super tackles; still level, shared.',
        metric: 'tackle_points',
        tieBreak: { metric: 'super_tackles', lowerIsBetter: false },
      },
    ],
  },
  'kho-kho': {
    points: { win: 2, draw: 1, loss: 0 },
    tieBreaks: ['point_difference'],
    allowedTieBreaks: ['point_difference', 'wins'],
    allowsDraws: true,
    totals: (state: KhoKhoState, side) => ({
      pointsFor: state.score[side],
      pointsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    leaderboards: [
      { metric: 'outs_made', label: 'Most defenders put out' },
      { metric: 'pole_dives', label: 'Most pole dives' },
    ],
    playerAwards: [
      {
        key: 'best-chaser',
        name: 'Best Chaser',
        criteria:
          'Most defenders put out over the tournament; then most pole dives; still level, shared.',
        metric: 'outs_made',
        tieBreak: { metric: 'pole_dives', lowerIsBetter: false },
      },
    ],
  },
  wrestling: {
    // Pools rank by wins, then UWW classification points (5 for a fall, 4 or 3 otherwise).
    points: { win: 1, draw: 0, loss: 0 },
    tieBreaks: ['classification_points', 'point_difference'],
    allowedTieBreaks: ['classification_points', 'point_difference'],
    allowsDraws: false,
    totals: (state: WrestlingState, side) => ({
      classificationPoints: classificationPoints(state)?.[side] ?? 0,
      pointsFor: state.score[side],
      pointsAgainst: state.score[side === 0 ? 1 : 0],
    }),
    leaderboards: [
      { metric: 'wins_by_fall', label: 'Most wins by fall' },
      { metric: 'technical_points', label: 'Most technical points' },
    ],
    playerAwards: [],
  },
  chess: {
    points: { win: 1, draw: 0.5, loss: 0 },
    tieBreaks: ['sonneborn_berger', 'wins'],
    allowedTieBreaks: ['sonneborn_berger', 'wins'],
    allowsDraws: true,
    totals: () => ({}),
    leaderboards: [],
    playerAwards: [],
  },
};

export function tournamentRules(sport: SportKey): TournamentRules | undefined {
  return RULES[sport];
}

/**
 * Sums player statistics across matches, keyed by roster member: a match's participant IDs
 * are its own, so `rosterOf` maps them back to the roster.
 */
export function aggregatePlayerStats(
  matches: { stats: readonly MetricRecord[]; rosterOf: (participantId: string) => string | null }[],
  derive?: (totals: Record<string, number>) => Record<string, number>,
): Map<string, Record<string, number>> {
  const totals = new Map<string, Record<string, number>>();
  for (const match of matches) {
    for (const r of match.stats) {
      if (!r.participantId) continue;
      const member = match.rosterOf(r.participantId);
      if (!member) continue;
      const row = totals.get(member) ?? {};
      row[r.metric] = (row[r.metric] ?? 0) + r.value;
      totals.set(member, row);
    }
  }
  if (derive) for (const row of totals.values()) Object.assign(row, derive(row));
  return totals;
}

/** Winners of a player award; empty when nobody has a positive value. */
export function playerAwardWinners(
  rule: PlayerAwardRule,
  stats: Map<string, Record<string, number>>,
): { rosterMemberIds: string[]; metrics: Record<string, number> } | null {
  const rows = [...stats.entries()].map(([id, s]) => ({
    id,
    value: s[rule.metric] ?? 0,
    tie: rule.tieBreak ? (s[rule.tieBreak.metric] ?? 0) : 0,
  }));
  const top = Math.max(0, ...rows.map((r) => r.value));
  if (top <= 0) return null;
  let best = rows.filter((r) => r.value === top);
  if (rule.tieBreak && best.length > 1) {
    const pick = rule.tieBreak.lowerIsBetter
      ? Math.min(...best.map((r) => r.tie))
      : Math.max(...best.map((r) => r.tie));
    best = best.filter((r) => r.tie === pick);
  }
  const metrics: Record<string, number> = { [rule.metric]: top };
  if (rule.tieBreak) metrics[rule.tieBreak.metric] = best[0]!.tie;
  return { rosterMemberIds: best.map((r) => r.id).sort(), metrics };
}
