import type { MatchAwardDefinition } from '@scoresphere/engine-kit';
import { gamesWon, type BadmintonState } from './engine.js';

/**
 * Proposed default, pending owner sign-off (plan §7): badminton records no shot-level
 * statistics, so the match award recognises the winning side. Doubles partners share it.
 * A walkover has no play to recognise, so it is left to the organizer.
 */
export const badmintonPlayerOfTheMatch: MatchAwardDefinition<BadmintonState> = {
  key: 'player-of-the-match',
  name: 'Player of the Match',
  criteriaVersion: 1,
  criteria:
    'Goes to the winning side; doubles partners share it. Not awarded automatically for a walkover.',
  compute(state, stats) {
    if (!state.outcome || state.outcome.method === 'walkover') return null;
    const side = state.outcome.winner;
    const metric = (name: string) =>
      stats.find((s) => s.metric === name && s.side === side && !s.participantId)?.value ?? 0;
    return {
      recipients: state.players[side].map((participantId) => ({ participantId, side })),
      metrics: {
        games_won: gamesWon(state)[side],
        points_won: metric('points_won'),
        longest_streak: metric('longest_streak'),
      },
    };
  },
};

export const badmintonMatchAwards = [badmintonPlayerOfTheMatch] as const;
