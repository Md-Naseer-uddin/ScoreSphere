import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Rules' text. Confirm against the source before relying on it. */
export const tennisRules: RulesContent = {
  sport: 'tennis',
  summary: 'Win points to win games, games to win sets, and sets to win the match.',
  sources: [
    {
      name: 'ITF Rules of Tennis',
      url: 'https://www.itftennis.com/en/about-us/governance/rules-and-regulations/',
      edition: 'Current edition, including Appendix V (alternative scoring methods)',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Games',
      points: [
        'Points are called 0 (love), 15, 30 and 40. At 40–40 it is deuce: a player needs two points in a row to win the game.',
        'With no-ad scoring, the point at deuce decides the game.',
      ],
    },
    {
      title: 'Sets and tie-breaks',
      points: [
        'A set is won by the first side to six games with a two-game lead.',
        'At 6–6 a tie-break is played: first to seven points with a two-point lead. The tie-break counts as one game, so the set is won 7–6.',
        'In a tie-break the first server serves one point, then the players serve two points each in turn.',
        'The deciding set can be played as a normal tie-break set, as an advantage set, or replaced by a match tie-break to 10.',
      ],
    },
    {
      title: 'Serving and ends',
      points: [
        'Service changes after every game. In doubles the order is fixed: a player from one team, then one from the other, then their partners.',
        'Players change ends after the first, third and every other odd-numbered game of each set, and every six points in a tie-break.',
        'Whoever received first in a tie-break serves first in the next set.',
      ],
    },
  ],
};
