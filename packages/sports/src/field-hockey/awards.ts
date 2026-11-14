import type { MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { HockeyState } from './engine.js';

/**
 * Proposed defaults, pending owner sign-off (plan §7). They need recorded scorers; a
 * goalkeeper award needs saves, which aren't recorded, so there is none (spec scoring §5).
 */

const played = (state: HockeyState) =>
  state.outcome !== null &&
  state.outcome.finish !== 'forfeit' &&
  state.outcome.finish !== 'walkover';

const metric = (stats: readonly MetricRecord[], participantId: string, name: string) =>
  stats.find((s) => s.participantId === participantId && s.metric === name)?.value ?? 0;

/** Players with the highest positive value; then the winning side; still level, shared. */
function leaders(
  state: HockeyState,
  stats: readonly MetricRecord[],
  value: (participantId: string) => number,
  metrics: (participantId: string) => Record<string, number>,
) {
  const rows = stats
    .filter((s) => s.metric === 'appearances' && s.participantId)
    .map((s) => ({
      participantId: s.participantId!,
      side: s.side as 0 | 1,
      value: value(s.participantId!),
    }));
  const top = Math.max(0, ...rows.map((r) => r.value));
  if (top === 0) return null;
  let best = rows.filter((r) => r.value === top);
  const winner = state.outcome?.winner;
  if (best.length > 1 && winner != null && best.some((r) => r.side === winner)) {
    best = best.filter((r) => r.side === winner);
  }
  return {
    recipients: best.map((r) => ({ participantId: r.participantId, side: r.side })),
    metrics: metrics(best[0]!.participantId),
  };
}

export const hockeyPlayerOfTheMatch: MatchAwardDefinition<HockeyState> = {
  key: 'player-of-the-match',
  name: 'Player of the Match',
  criteriaVersion: 1,
  criteria:
    'Most impact points (2 per goal, 1 per assist; shoot-out attempts don’t count); then a player on the winning team; still level, shared. Needs recorded scorers.',
  compute: (state, stats) =>
    played(state)
      ? leaders(
          state,
          stats,
          (id) => 2 * metric(stats, id, 'goals') + metric(stats, id, 'assists'),
          (id) => ({ goals: metric(stats, id, 'goals'), assists: metric(stats, id, 'assists') }),
        )
      : null,
};

export const hockeyTopScorer: MatchAwardDefinition<HockeyState> = {
  key: 'top-scorer',
  name: 'Top Scorer',
  criteriaVersion: 1,
  criteria: 'Most goals; then a player on the winning team; still level, shared.',
  compute: (state, stats) =>
    played(state)
      ? leaders(
          state,
          stats,
          (id) => metric(stats, id, 'goals'),
          (id) => ({ goals: metric(stats, id, 'goals') }),
        )
      : null,
};

export const hockeyMatchAwards = [hockeyPlayerOfTheMatch, hockeyTopScorer] as const;
