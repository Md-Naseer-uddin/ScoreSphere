import type { RulesContent } from '../content.js';

/** A summary in our own words. Confirm against the federation's current rules before relying on it. */
export const kabaddiRules: RulesContent = {
  sport: 'kabaddi',
  summary:
    'Seven players a side on the mat, two halves of 20 minutes. Teams take turns to send a raider into the other half to touch defenders and get back; the defenders try to stop the raider.',
  sources: [
    {
      name: 'Amateur Kabaddi Federation of India (AKFI) rules',
      url: 'https://www.indiankabaddi.org/',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Raids',
      points: [
        'Each defender the raider touches is out once the raider gets back to their own half, and the raiding team scores a point for each.',
        'Crossing the bonus line scores a bonus point, but only while the defence has at least six players on the mat.',
        'If the defenders stop the raider getting back, the raider is out and the defence scores a point (a tackle).',
        'With the raid timer on, a raid lasts at most 30 seconds; a raider who runs out of time or steps out of bounds is out.',
      ],
    },
    {
      title: 'Out and revived',
      points: [
        'Players who are out wait off the mat. For each opponent put out, one of your out players comes back (a revival), in the order they went out.',
        'When every player of a team is out, the other team scores two extra points for the all out and the whole team comes back.',
      ],
    },
    {
      title: 'Newer rules (settings)',
      points: [
        'Super tackle: a tackle by three or fewer defenders scores 2 points.',
        'Do-or-die raid: after two empty raids in a row, a team’s next raid must score, or the raider is out.',
        'Teams take turns to raid, and the team that didn’t raid first in the first half raids first in the second.',
        'A level knockout match needs a tie-break, which ScoreSphere leaves to the organiser.',
      ],
    },
  ],
};
