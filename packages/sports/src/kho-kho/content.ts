import type { RulesContent } from '../content.js';

/** A summary in our own words. Confirm against the federation's current rules before relying on it. */
export const khoKhoRules: RulesContent = {
  sport: 'kho-kho',
  summary:
    'Teams take turns to chase and defend. The chasers try to touch defenders, who enter in batches of three; every defender put out scores for the chasing team.',
  sources: [
    {
      name: 'Kho Kho Federation of India (KKFI) rules',
      url: 'https://www.khokhofederation.in/',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Turns and innings',
      points: [
        'An innings is one chasing turn for each team; a match usually has two innings. Turn length is a setting.',
        'The toss decides who chases first; teams then take turns.',
      ],
    },
    {
      title: 'Chasing and defending',
      points: [
        'Eight chasers sit in the centre lane, facing alternate ways; the active chaser passes the chase on with a “kho”.',
        'Defenders enter three at a time. A defender is out when touched by the active chaser, when stepping out of the field, or when entering late.',
        'When all the defenders are out, the batches start again and play continues until the turn ends.',
      ],
    },
    {
      title: 'Scoring',
      points: [
        'The chasing team scores a point for each defender put out. The team with more points wins.',
        'ScoreSphere records who put a defender out when you choose the chaser; that feeds the Best Chaser award.',
        'Follow-ons, dream runs and tie-breaks are not supported yet; a level knockout match is left to the organiser.',
      ],
    },
  ],
};
