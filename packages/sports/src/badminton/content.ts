import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Laws' text. Confirm against the source before relying on it. */
export const badmintonRules: RulesContent = {
  sport: 'badminton',
  summary:
    'Rally scoring: every rally wins a point for one side, whoever served. Singles is one player a side, doubles two.',
  sources: [
    {
      name: 'BWF Laws of Badminton (Statutes, Section 4.1)',
      url: 'https://corporate.bwfbadminton.com/statutes/',
      edition: '2025 Laws: best of 3 games to 21',
      effectiveUntil: '2027-01-03',
      lastReviewed: '2026-11-14',
    },
    {
      name: 'BWF: Key changes under the 3×15 scoring system',
      url: 'https://bwfbadminton.com/news-single/2026/04/26/key-changes-under-the-3x15-scoring-system',
      edition:
        'Laws effective 4 January 2027: best of 3 games to 15; 3×21 stays an approved alternative',
      effectiveFrom: '2027-01-04',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Winning a game and the match',
      points: [
        '3×21: a game goes to 21 points. At 20–all you need a two-point lead; at 29–all the next point wins (30 is the cap).',
        '3×15 (from 4 January 2027): a game goes to 15. At 14–all you need a two-point lead; at 20–all the next point wins (21 is the cap).',
        'The match is best of three games unless the organisers choose another approved format.',
        'The side that wins a game serves first in the next one.',
      ],
    },
    {
      title: 'Service courts',
      points: [
        "Serve from the right service court when the serving side's score is even (including 0), and from the left when it is odd.",
        'Serve diagonally: the receiver stands in the service court opposite the server.',
        'In singles, the receiver stands in the court that matches the server’s score.',
      ],
    },
    {
      title: 'Doubles service order',
      points: [
        'When the serving side wins a rally, it scores and the same player serves again from the other court; the partners swap courts.',
        'When the receiving side wins a rally, it scores and becomes the serving side. Nobody changes court; the player standing in the court that matches the new score serves.',
        'Players change service courts only after winning a point on their own serve.',
      ],
    },
    {
      title: 'Intervals and ends',
      points: [
        'In 3×21 there is an interval of up to 60 seconds when the leading score reaches 11, and up to 2 minutes between games.',
        'Sides change ends after each game, and in the deciding game when the leading score reaches 11 (3×21).',
        'ScoreSphere prompts for these when the preset sets them. The 3×15 interval points are not shown until BWF publishes them in the Laws.',
      ],
    },
  ],
};
