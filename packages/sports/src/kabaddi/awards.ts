import type { MatchAwardDefinition, MetricRecord } from '@scoresphere/engine-kit';
import type { KabaddiState } from './engine.js';

/**
 * Proposed defaults, pending owner sign-off (plan §7). They need raiders and tacklers
 * recorded; without them no player award is given (spec scoring §5).
 */

const played = (state: KabaddiState) => state.outcome?.finish === 'played';

const metric = (stats: readonly MetricRecord[], participantId: string, name: string) =>
  stats.find((s) => s.participantId === participantId && s.metric === name)?.value ?? 0;

function leaders(
  state: KabaddiState,
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

export const kabaddiPlayerOfTheMatch: MatchAwardDefinition<KabaddiState> = {
  key: 'player-of-the-match',
  name: 'Player of the Match',
  criteriaVersion: 1,
  criteria:
    'Most raid points plus tackle points; then a player on the winning team; still level, shared.',
  compute: (state, stats) =>
    played(state)
      ? leaders(
          state,
          stats,
          (id) => metric(stats, id, 'raid_points') + metric(stats, id, 'tackle_points'),
          ['raid_points', 'tackle_points'],
        )
      : null,
};

export const kabaddiBestRaider: MatchAwardDefinition<KabaddiState> = {
  key: 'best-raider',
  name: 'Best Raider',
  criteriaVersion: 1,
  criteria:
    'Most raid points (touch and bonus); then a player on the winning team; still level, shared.',
  compute: (state, stats) =>
    played(state)
      ? leaders(state, stats, (id) => metric(stats, id, 'raid_points'), ['raid_points'])
      : null,
};

export const kabaddiBestDefender: MatchAwardDefinition<KabaddiState> = {
  key: 'best-defender',
  name: 'Best Defender',
  criteriaVersion: 1,
  criteria:
    'Most tackle points (2 for a super tackle); then a player on the winning team; still level, shared.',
  compute: (state, stats) =>
    played(state)
      ? leaders(state, stats, (id) => metric(stats, id, 'tackle_points'), ['tackle_points'])
      : null,
};

export const kabaddiMatchAwards = [
  kabaddiPlayerOfTheMatch,
  kabaddiBestRaider,
  kabaddiBestDefender,
] as const;
