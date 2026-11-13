import type { MatchAwardDefinition } from '@scoresphere/engine-kit';
import { tennisSetsWon, type TennisState } from './engine.js';

/**
 * Proposed default, pending owner sign-off (plan §7): tennis recognises the winner of the
 * match; doubles partners share it. Not awarded automatically for a walkover.
 */
export const tennisPlayerOfTheMatch: MatchAwardDefinition<TennisState> = {
  key: 'player-of-the-match',
  name: 'Player of the Match',
  criteriaVersion: 1,
  criteria:
    'Goes to the winning side; doubles partners share it. Not awarded automatically for a walkover.',
  compute(state) {
    if (!state.outcome || state.outcome.method === 'walkover') return null;
    const side = state.outcome.winner;
    return {
      recipients: state.players[side].map((participantId) => ({ participantId, side })),
      metrics: {
        sets_won: tennisSetsWon(state)[side],
        points_won: state.stats.points[side],
        breaks: state.stats.breaks[side],
      },
    };
  },
};
