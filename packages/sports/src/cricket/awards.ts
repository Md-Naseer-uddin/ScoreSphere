import type { AwardOutcome, MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { CricketState } from './engine.js';
import { playerMetric } from './stats.js';

/**
 * Proposed defaults, pending owner sign-off (plan §7). Ties that survive the tie-breaks
 * are shared; organizers can override any automatic award (M6).
 */

function everyone(state: CricketState): { id: string; side: number }[] {
  return state.players.flatMap((ids, side) => ids.map((id) => ({ id, side })));
}

/** Picks the best candidates by a list of comparators; whoever is still level shares it. */
function best(
  candidates: { id: string; side: number }[],
  keys: ((id: string) => number)[],
): { id: string; side: number }[] {
  let pool = candidates;
  for (const key of keys) {
    const top = Math.max(...pool.map((c) => key(c.id)));
    pool = pool.filter((c) => key(c.id) === top);
    if (pool.length <= 1) break;
  }
  return pool;
}

const outcome = (
  winners: { id: string; side: number }[],
  metrics: Record<string, number>,
): AwardOutcome => ({
  recipients: winners.map((w) => ({ participantId: w.id, side: w.side })),
  metrics,
});

const played = (state: CricketState) =>
  state.phase === 'complete' && !(state.outcome?.kind === 'won' && state.outcome.by === 'conceded');

export const cricketBestBatter: MatchAwardDefinition<CricketState> = {
  key: 'best-batter',
  name: 'Best Batter',
  criteriaVersion: 1,
  criteria: 'Most runs; then fewest balls faced; still level, the award is shared.',
  compute(state, stats) {
    if (!played(state)) return null;
    const runs = (id: string) => playerMetric(stats, id, 'runs');
    const winners = best(everyone(state), [runs, (id) => -playerMetric(stats, id, 'balls_faced')]);
    if (winners.length === 0 || runs(winners[0]!.id) === 0) return null;
    const id = winners[0]!.id;
    return outcome(winners, {
      runs: runs(id),
      balls_faced: playerMetric(stats, id, 'balls_faced'),
    });
  },
};

export const cricketBestBowler: MatchAwardDefinition<CricketState> = {
  key: 'best-bowler',
  name: 'Best Bowler',
  criteriaVersion: 1,
  criteria: 'Most wickets; then fewest runs conceded; still level, the award is shared.',
  compute(state, stats) {
    if (!played(state)) return null;
    const wickets = (id: string) => playerMetric(stats, id, 'wickets');
    const winners = best(everyone(state), [
      wickets,
      (id) => -playerMetric(stats, id, 'runs_conceded'),
    ]);
    if (winners.length === 0 || wickets(winners[0]!.id) === 0) return null;
    const id = winners[0]!.id;
    return outcome(winners, {
      wickets: wickets(id),
      runs_conceded: playerMetric(stats, id, 'runs_conceded'),
    });
  },
};

/** Impact points: runs + 20 a wicket + 10 a catch, stumping or run-out. */
export function impactPoints(stats: readonly MetricRecord[], id: string): number {
  const m = (metric: string) => playerMetric(stats, id, metric);
  return m('runs') + 20 * m('wickets') + 10 * (m('catches') + m('stumpings') + m('run_outs'));
}

export const cricketPlayerOfTheMatch: MatchAwardDefinition<CricketState> = {
  key: 'player-of-the-match',
  name: 'Player of the Match',
  criteriaVersion: 1,
  criteria:
    'Most impact points (runs + 20 per wicket + 10 per catch, stumping or run-out); then a player on the winning side; then most runs; still level, shared.',
  compute(state, stats) {
    if (!played(state)) return null;
    const winner = state.outcome?.kind === 'won' ? state.outcome.winner : null;
    const winners = best(everyone(state), [
      (id) => impactPoints(stats, id),
      (id) => (winner !== null && state.players[winner].includes(id) ? 1 : 0),
      (id) => playerMetric(stats, id, 'runs'),
    ]);
    if (winners.length === 0 || impactPoints(stats, winners[0]!.id) === 0) return null;
    const id = winners[0]!.id;
    return outcome(winners, {
      impact_points: impactPoints(stats, id),
      runs: playerMetric(stats, id, 'runs'),
      wickets: playerMetric(stats, id, 'wickets'),
    });
  },
};

export const cricketMatchAwards = [
  cricketPlayerOfTheMatch,
  cricketBestBatter,
  cricketBestBowler,
] as const;
