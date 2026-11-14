import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Laws' text. Confirm against the source before relying on it. */
export const carromRules: RulesContent = {
  sport: 'carrom',
  summary:
    'Each side pockets its own nine coins with the striker. The side that clears its coins wins the board and scores one point for every opposing coin left, plus the queen if it covered her.',
  sources: [
    {
      name: 'International Carrom Federation (ICF) Laws of Carrom',
      url: 'https://www.icfcarrom.com/',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Boards',
      points: [
        'Breaks alternate from board to board. A board ends when one side has pocketed all its coins.',
        'The winner scores the number of the loser’s coins still on the board.',
      ],
    },
    {
      title: 'The queen',
      points: [
        'The queen must be “covered”: pocketed, then followed by one of your own coins in the same or the next turn. Otherwise she goes back to the centre.',
        'She is worth 3 points to the board winner who covered her, but only while that side’s game score is below 22.',
      ],
    },
    {
      title: 'Games and fouls',
      points: [
        'A game is won at 25 points, or after 8 boards by whoever leads, with extra boards while level. Matches are often best of three games.',
        'A foul (such as pocketing the striker) costs the player a turn and one pocketed coin, put back on the board. ScoreSphere counts fouls; the coins left at the end of the board already reflect the penalty.',
      ],
    },
  ],
};
