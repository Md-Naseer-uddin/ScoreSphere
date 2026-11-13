import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Laws' text. Confirm against the sources before relying on it. */
export const cricketRules: RulesContent = {
  sport: 'cricket',
  summary:
    'Two sides of up to 11 take turns to bat and bowl. The side batting second chases the first side’s total in its overs.',
  sources: [
    {
      name: 'MCC Laws of Cricket',
      url: 'https://www.lords.org/mcc/the-laws-of-cricket',
      edition: '2017 Code (3rd edition, 2022)',
      lastReviewed: '2026-11-14',
    },
    {
      name: 'ICC Playing Conditions (men’s T20I and ODI)',
      url: 'https://www.icc-cricket.com/about/cricket/rules-and-regulations/playing-conditions',
      edition: 'Current playing conditions: overs, bowler limits, free hit, super over',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Overs and innings',
      points: [
        'Each side bats once for at most its overs (T20: 20, one-day: 50). An over is six legal balls.',
        'Wides and no-balls are not legal balls: they add a penalty run and are bowled again.',
        'A bowler may not bowl two overs in a row. T20 bowlers are limited to 4 overs, one-day bowlers to 10.',
      ],
    },
    {
      title: 'Runs and extras',
      points: [
        'Runs off the bat go to the batter. Byes and leg-byes go to the team, not the batter or bowler.',
        'Wides and no-balls are charged to the bowler, along with any runs off the bat from a no-ball.',
        'After a no-ball the next ball is a free hit in limited-overs cricket: the batter can only be run out (or out obstructing the field, or hitting the ball twice).',
      ],
    },
    {
      title: 'Wickets',
      points: [
        'Bowled, caught, lbw, stumped and hit wicket are credited to the bowler. Run-outs are not.',
        'After a catch, the new batter faces the next ball (unless the over has ended).',
        'An innings ends when ten wickets have fallen, the overs run out, or the chasing side passes the target.',
      ],
    },
    {
      title: 'Result',
      points: [
        'The side batting second wins by the wickets it had left; the side batting first wins by its run margin.',
        'If the scores are level the match is tied. Many competitions then play a super over: one over a side, two wickets.',
      ],
    },
    {
      title: 'Local rules in ScoreSphere',
      points: [
        'Gully and box presets are local conventions, not official rules. Every setting is shown before the match starts.',
        'Last man stands: the last batter may bat on alone.',
        'Six and out: a six over the boundary is out; the preset says whether the six still counts.',
        'One tip one hand: a one-handed catch after one bounce is out, like a catch.',
        'Consecutive wides: after the set number of wides in a row, the batting side gets extra penalty runs.',
      ],
    },
  ],
};
