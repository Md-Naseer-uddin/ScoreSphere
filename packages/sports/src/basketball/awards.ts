import type { MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { BasketballState } from './engine.js';

/**
 * Proposed defaults, pending owner sign-off (plan §7). Leaders are named only for statistics
 * the scorer recorded (spec scoring §5).
 */

const played = (state: BasketballState) =>
  state.outcome !== null &&
  state.outcome.finish !== 'forfeit' &&
  state.outcome.finish !== 'walkover';

const metric = (stats: readonly MetricRecord[], participantId: string, name: string) =>
  stats.find((s) => s.participantId === participantId && s.metric === name)?.value ?? 0;

/** Players with the highest positive value; then the winning side; still level, shared. */
function leaders(
  state: BasketballState,
  stats: readonly MetricRecord[],
  value: (participantId: string) => number,
  shown: string[],
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
  const id = best[0]!.participantId;
  return {
    recipients: best.map((r) => ({ participantId: r.participantId, side: r.side })),
    metrics: Object.fromEntries(shown.map((m) => [m, metric(stats, id, m)])),
  };
}

/** Points plus rebounds, assists, steals and blocks, less turnovers and missed shots. */
export function efficiency(stats: readonly MetricRecord[], id: string): number {
  const m = (name: string) => metric(stats, id, name);
  return (
    m('points') +
    m('rebounds') +
    m('assists') +
    m('steals') +
    m('blocks') -
    m('turnovers') -
    m('missed_shots')
  );
}

const leader = (
  key: string,
  name: string,
  criteria: string,
  stat: string,
): MatchAwardDefinition<BasketballState> => ({
  key,
  name,
  criteriaVersion: 1,
  criteria,
  compute: (state, stats) =>
    played(state) ? leaders(state, stats, (id) => metric(stats, id, stat), [stat]) : null,
});

export const basketballMvp: MatchAwardDefinition<BasketballState> = {
  key: 'mvp',
  name: 'MVP',
  criteriaVersion: 1,
  criteria:
    'Highest efficiency: points + rebounds + assists + steals + blocks − turnovers − missed shots, counting what was recorded; then a player on the winning team; still level, shared.',
  compute: (state, stats) =>
    played(state)
      ? leaders(state, stats, (id) => efficiency(stats, id), ['points', 'rebounds', 'assists'])
      : null,
};

export const basketballMatchAwards = [
  basketballMvp,
  leader(
    'top-scorer',
    'Top Scorer',
    'Most points; then a player on the winning team; still level, shared.',
    'points',
  ),
  leader(
    'rebounds-leader',
    'Rebounds Leader',
    'Most rebounds; then a player on the winning team; still level, shared. Needs rebounds recorded.',
    'rebounds',
  ),
  leader(
    'assists-leader',
    'Assists Leader',
    'Most assists; then a player on the winning team; still level, shared. Needs assists recorded.',
    'assists',
  ),
] as const;
