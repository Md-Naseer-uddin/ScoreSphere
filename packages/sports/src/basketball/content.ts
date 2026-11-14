import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Rules' text. Confirm against the source before relying on it. */
export const basketballRules: RulesContent = {
  sport: 'basketball',
  summary:
    'Five players a side over four quarters of 10 minutes. Baskets score 2 points, or 3 from beyond the arc, and free throws 1. There are no draws: level games go to overtime.',
  sources: [
    {
      name: 'FIBA Official Basketball Rules',
      url: 'https://www.fiba.basketball/documents/official-basketball-rules',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Time',
      points: [
        'Four quarters of 10 minutes of playing time. The game clock stops on whistles; the scorer starts and stops it, as the table officials do.',
        'If the score is level at the end, 5-minute overtime periods are played until there is a winner.',
        'The shot clock (24 seconds, reset to 14 in some situations) is shown as an aid on the scoring device; it is not recorded.',
      ],
    },
    {
      title: 'Fouls',
      points: [
        'A player with five fouls must leave the game. Two technical or unsportsmanlike fouls, or one disqualifying foul, also put a player out.',
        'After a team’s fourth foul in a quarter, every further foul brings the penalty: free throws. Fouls in overtime count with the fourth quarter.',
      ],
    },
    {
      title: 'Timeouts and statistics',
      points: [
        'Each team has two timeouts in the first half, three in the second and one in each overtime. ScoreSphere doesn’t yet apply the limit on timeouts in the last two minutes.',
        'Rebounds, assists, steals, blocks, turnovers and missed shots are optional to record; leaders are only named for what was recorded.',
      ],
    },
  ],
};
