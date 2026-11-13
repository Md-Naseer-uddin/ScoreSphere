import type { MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { VolleyballState } from './engine.js';

/**
 * Proposed defaults, pending owner sign-off (plan §7). Player awards need point credits;
 * without them only the result is recognised (spec scoring §5: never invent statistics).
 */

const credited = (stats: readonly MetricRecord[], metric: string) =>
  stats.filter((s) => s.metric === metric && s.participantId);

function leader(state: VolleyballState, stats: readonly MetricRecord[], metric: string) {
  const rows = credited(stats, metric);
  const top = Math.max(0, ...rows.map((r) => r.value));
  if (top === 0) return null;
  let best = rows.filter((r) => r.value === top);
  const winner = state.outcome?.winner;
  if (best.length > 1 && winner !== undefined && best.some((r) => r.side === winner)) {
    best = best.filter((r) => r.side === winner);
  }
  return {
    recipients: best.map((r) => ({ participantId: r.participantId!, side: r.side! })),
    metrics: { [metric]: top },
  };
}

const finished = (state: VolleyballState) =>
  state.outcome !== null && state.outcome.method === 'played';

export const volleyballMvp: MatchAwardDefinition<VolleyballState> = {
  key: 'mvp',
  name: 'MVP',
  criteriaVersion: 1,
  criteria:
    'Most points scored (attacks, blocks and aces); then a player on the winning team; still level, shared. Needs point credits.',
  compute: (state, stats) => (finished(state) ? leader(state, stats, 'points_scored') : null),
};

export const volleyballBestSpiker: MatchAwardDefinition<VolleyballState> = {
  key: 'best-spiker',
  name: 'Best Spiker',
  criteriaVersion: 1,
  criteria: 'Most attack points; then a player on the winning team; still level, shared.',
  compute: (state, stats) => (finished(state) ? leader(state, stats, 'attack_points') : null),
};

export const volleyballBestBlocker: MatchAwardDefinition<VolleyballState> = {
  key: 'best-blocker',
  name: 'Best Blocker',
  criteriaVersion: 1,
  criteria: 'Most block points; then a player on the winning team; still level, shared.',
  compute: (state, stats) => (finished(state) ? leader(state, stats, 'block_points') : null),
};

export const volleyballMatchAwards = [
  volleyballMvp,
  volleyballBestSpiker,
  volleyballBestBlocker,
] as const;
