import type { MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { KhoKhoState } from './engine.js';

/**
 * Proposed default, pending owner sign-off (plan §7). A defender award would need the time
 * each defender stayed in, which isn't recorded, so there is none (spec scoring §5).
 */
const metric = (stats: readonly MetricRecord[], participantId: string, name: string) =>
  stats.find((s) => s.participantId === participantId && s.metric === name)?.value ?? 0;

export const khoKhoBestChaser: MatchAwardDefinition<KhoKhoState> = {
  key: 'best-chaser',
  name: 'Best Chaser',
  criteriaVersion: 1,
  criteria:
    'Most defenders put out (touches and pole dives); then a player on the winning team; still level, shared.',
  compute(state, stats) {
    if (state.outcome?.finish !== 'played') return null;
    const rows = stats
      .filter((s) => s.metric === 'appearances' && s.participantId)
      .map((s) => ({
        participantId: s.participantId!,
        side: s.side as 0 | 1,
        value: metric(stats, s.participantId!, 'outs_made'),
      }));
    const top = Math.max(0, ...rows.map((r) => r.value));
    if (top === 0) return null;
    let best = rows.filter((r) => r.value === top);
    const winner = state.outcome.winner;
    if (best.length > 1 && winner !== null && best.some((r) => r.side === winner)) {
      best = best.filter((r) => r.side === winner);
    }
    return {
      recipients: best.map((r) => ({ participantId: r.participantId, side: r.side })),
      metrics: { outs_made: top },
    };
  },
};

export const khoKhoMatchAwards = [khoKhoBestChaser] as const;
