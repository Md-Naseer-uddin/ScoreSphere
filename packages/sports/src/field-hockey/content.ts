import type { RulesContent } from '../content.js';

/** A summary in our own words, not the Rules' text. Confirm against the source before relying on it. */
export const hockeyRules: RulesContent = {
  sport: 'field-hockey',
  summary:
    'Eleven players a side over four quarters of 15 minutes. Goals count only when struck from inside the shooting circle; the team with more goals wins.',
  sources: [
    {
      name: 'FIH Rules of Hockey',
      url: 'https://www.fih.hockey/about-fih/official-documents/rules-of-hockey',
      edition: 'Current edition',
      lastReviewed: '2026-11-14',
    },
  ],
  sections: [
    {
      title: 'Time',
      points: [
        'Four quarters of 15 minutes, with short intervals after the first and third quarters and a longer one at half-time. Casual matches often play two halves.',
        'In FIH competitions the clock stops after a goal until the centre pass, and while a penalty corner is set up. ScoreSphere does the same when “Stop the clock” is on; restart it when play restarts.',
      ],
    },
    {
      title: 'Goals, penalty corners and strokes',
      points: [
        'A goal is scored when an attacker plays the ball inside the shooting circle and it goes over the goal line, between the posts and under the crossbar.',
        'Penalty corners are recorded for the team they are awarded to; a goal from one is shown as a penalty-corner goal.',
        'A penalty stroke is a single shot at goal from the penalty spot; record whether it was scored.',
      ],
    },
    {
      title: 'Cards',
      points: [
        'A green card suspends a player for 2 minutes of playing time, and a yellow card for at least 5. A red card sends the player off for the rest of the match.',
        'Suspensions run only while the clock runs, and the team plays short while they last. ScoreSphere shows the time left.',
      ],
    },
    {
      title: 'Substitutes and shoot-outs',
      points: [
        'Teams may substitute as often as they like, so ScoreSphere doesn’t track who is on the pitch.',
        'Where a result is needed, a level match goes to a shoot-out: one-on-ones from the 23-metre line, five per team taken alternately, then sudden death.',
      ],
    },
  ],
};
