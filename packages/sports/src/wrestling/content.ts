import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Rules' text. Confirm against the source before relying on it. */
export const wrestlingRules: RulesContent = {
  sport: 'wrestling',
  summary:
    'Two wrestlers, two periods of 3 minutes. A fall wins at once; so does a lead of 10 points (8 in Greco-Roman). Otherwise the wrestler with more points wins.',
  sources: [
    {
      name: 'UWW International Wrestling Rules',
      url: 'https://uww.org/governance/rules',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Styles and weight',
      points: [
        'Freestyle and women’s wrestling allow holds on the legs; Greco-Roman does not.',
        'Wrestlers meet only within their weight category: run each category as its own tournament.',
      ],
    },
    {
      title: 'Points',
      points: [
        'Each action scores 1, 2, 4 or 5 points, as the referee signals. Record the points shown.',
        'A caution gives the opponent 1 or 2 points; a third caution disqualifies the wrestler.',
      ],
    },
    {
      title: 'Winning',
      points: [
        'Fall (pinning both shoulders), technical superiority, or more points at the end.',
        'A level bout is decided by the criteria: the highest-value action, then fewer cautions, then the last point scored.',
        'Classification points rank wrestlers in pools: 5–0 for a fall or a forfeit, 4–0 or 4–1 for technical superiority, 3–0 or 3–1 on points.',
      ],
    },
  ],
};
