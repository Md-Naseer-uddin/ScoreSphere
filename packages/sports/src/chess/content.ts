import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Laws' text. Confirm against the source before relying on it. */
export const chessRules: RulesContent = {
  sport: 'chess',
  summary:
    'ScoreSphere is the chess clock and result sheet. It does not check moves: players and arbiters do.',
  sources: [
    {
      name: 'FIDE Laws of Chess',
      url: 'https://handbook.fide.com/chapter/E012023',
      edition: 'Laws of Chess (current edition), including Appendices A (rapid) and B (blitz)',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'The clock',
      points: [
        'Each player has their own time. After moving, a player presses the clock, which stops theirs and starts the opponent’s.',
        'An increment adds time after every move. A delay makes the first seconds of each move free.',
        'Some time controls add time after a set number of moves, such as 30 minutes after move 40.',
        'Pausing the game stops both clocks.',
      ],
    },
    {
      title: 'Results',
      points: [
        'A game is won by checkmate, resignation, or when the opponent’s time runs out.',
        'It is drawn by agreement, stalemate, threefold repetition, the 50-move rule, or when neither side can checkmate.',
        'If a player’s time runs out but the opponent cannot checkmate by any legal moves, the game is drawn.',
      ],
    },
  ],
};
