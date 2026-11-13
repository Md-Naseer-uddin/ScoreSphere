import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Rules' text. Confirm against the source before relying on it. */
export const volleyballRules: RulesContent = {
  sport: 'volleyball',
  summary:
    'Six players a side. Every rally scores a point; win sets to 25 and the match by winning three sets.',
  sources: [
    {
      name: 'FIVB Official Volleyball Rules',
      url: 'https://www.fivb.com/en/volleyball/thegame_glossary/officialrulesofthegames',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Scoring',
      points: [
        'Every rally wins a point for one team, whoever served.',
        'A set is won at 25 points with a two-point lead. The deciding fifth set goes to 15.',
        'Teams change ends after each set, and at 8 points in the deciding set.',
      ],
    },
    {
      title: 'Serving and rotation',
      points: [
        'When the receiving team wins a rally it gains the serve and rotates one position clockwise; the player moving into position I serves.',
        'The team that did not serve first in a set serves first in the next one. The deciding set has a new toss.',
      ],
    },
    {
      title: 'Substitutions and timeouts',
      points: [
        'Each team may make six substitutions and take two timeouts per set.',
        'ScoreSphere counts substitutions against the limit but does not yet check the re-entry restrictions or libero replacements.',
      ],
    },
  ],
};
