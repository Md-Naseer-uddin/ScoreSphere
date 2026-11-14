import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Laws' text. Confirm against the source before relying on it. */
export const footballRules: RulesContent = {
  sport: 'football',
  summary:
    'Eleven players a side over two halves of 45 minutes. The team with more goals wins; knockout matches can go to extra time and kicks from the penalty mark.',
  sources: [
    {
      name: 'IFAB Laws of the Game',
      url: 'https://www.theifab.com/laws-of-the-game-documents/',
      edition: '2025/26',
      effectiveFrom: '2025-07-01',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Time',
      points: [
        'Two equal halves of 45 minutes, with a half-time interval of up to 15 minutes. Competitions may agree shorter halves.',
        'The referee adds time lost to substitutions, injuries, goal celebrations and other delays. ScoreSphere shows it as added time, e.g. 45+2′.',
        'The scorer starts and ends each period, as the referee does; pausing the match stops the clock.',
      ],
    },
    {
      title: 'Goals',
      points: [
        'A goal counts when the whole ball crosses the goal line between the posts and under the bar.',
        'An own goal counts for the other team. ScoreSphere records it against the player but never as their goal.',
        'Scorers and assists are optional, but awards and leaderboards need them.',
      ],
    },
    {
      title: 'Players and substitutes',
      points: [
        'A team has at most 11 players on the field, and a match can’t start or continue with fewer than seven. Small-sided presets use fewer.',
        'Competitions set the number of substitutes, usually up to five. A player who has been substituted may not return, except where return substitutes are allowed (common in youth, veterans and grassroots football).',
      ],
    },
    {
      title: 'Cards',
      points: [
        'A yellow card is a caution. A second caution in the same match is a red card.',
        'A player sent off may not be replaced; the team plays with one fewer.',
        'Temporary dismissals (sin bins) are not supported yet.',
      ],
    },
    {
      title: 'Extra time and penalties',
      points: [
        'When a knockout match is level, two periods of extra time of up to 15 minutes each may be played.',
        'If still level, teams take turns at kicks from the penalty mark, five each. It ends early once one team can no longer catch up, then continues kick for kick (sudden death).',
        'Shootout goals decide the winner but are not added to the match score.',
      ],
    },
  ],
};
