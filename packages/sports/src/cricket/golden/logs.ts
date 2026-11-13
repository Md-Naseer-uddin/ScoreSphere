import type { CricketSettings } from '../settings.js';

/**
 * Cricket golden logs: a ball-by-ball script and the scorecard it must produce (plan §4).
 * The scorecards below were worked out by hand from the Laws, independently of the engine.
 *
 * Script lines (player handles are `a1…` for side A and `b1…` for side B):
 * - `toss A bat`, `innings A a1 a2` (side optional once known), `bowler b1`, `next a3`,
 *   `retire a1 hurt|out`, `swap`, `declare`
 * - deliveries, space-separated:
 *   `0`–`7` off the bat, `4!` / `6!` boundaries, `wd` / `wd2` (wide, runs run),
 *   `nb` / `nb1` / `nb4!` (no-ball, off the bat), `nbb1` / `nblb1` (no-ball byes / leg-byes),
 *   `b1` / `lb2` / `b4!`
 * - a wicket: `W` (bowled), `W:caught:b3`, or `<delivery>+W:<kind>[:<fielder>]`;
 *   run-outs name the batter and end: `1+W:run_out:a2:striker[:b4]`
 *
 * These logs are constructed to cover the rules. Logs from real scoresheets get `source`
 * set to where they came from.
 */
export interface CricketGoldenLog {
  name: string;
  source: string;
  config: CricketSettings;
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    innings: {
      score: string;
      extras?: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
      /** runs, balls, fours, sixes, how out ('not out', 'b b1', 'c b3 b b1', 'run out', …) */
      batters?: Record<string, [number, number, number, number, string]>;
      /** overs, maidens, runs, wickets */
      bowlers?: Record<string, [string, number, number, number]>;
      fallOfWickets?: string;
    }[];
    summary: string;
    winner: 'A' | 'B' | null;
    awards?: { playerOfTheMatch?: string[]; bestBatter?: string[]; bestBowler?: string[] };
  };
}

const base: CricketSettings = {
  playersPerSide: 11,
  oversPerInnings: 2,
  ballsPerOver: 6,
  maxOversPerBowler: null,
  allowConsecutiveOvers: false,
  wideRuns: 1,
  noBallRuns: 1,
  freeHit: true,
  lastManStands: false,
  sixAndOut: 'off',
  oneTipOneHand: false,
  consecutiveWides: null,
  superOver: 'off',
};

export const cricketGoldenLogs: CricketGoldenLog[] = [
  {
    name: 'Two-over chase: extras, strike, a catch, a run-out at the non-striker’s end',
    source: 'constructed',
    config: base,
    players: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      '1 wd 4! 0 2 W:caught:b3',
      'next a3',
      'nb1 1',
      'bowler b2',
      'lb2 6! 1 W',
      'next a4',
      'b1 0',
      'innings b1 b2',
      'bowler a1',
      '4! 4! 1 0+W:run_out:b1:non_striker:a3',
      'next b3',
      '2 wd wd 1',
      'bowler a2',
      '6! 0 2',
    ],
    expected: {
      innings: [
        {
          score: '21/2 (2.0)',
          extras: { wides: 1, noBalls: 1, byes: 1, legByes: 2, penalties: 0 },
          batters: {
            a1: [9, 6, 0, 1, 'not out'],
            a2: [6, 4, 1, 0, 'c b3 b b1'],
            a3: [1, 2, 0, 0, 'b b2'],
            a4: [0, 1, 0, 0, 'not out'],
          },
          bowlers: { b1: ['1.0', 0, 11, 1], b2: ['1.0', 0, 7, 1] },
          fallOfWickets: '1-8 (0.5), 2-20 (1.4)',
        },
        {
          score: '22/1 (1.3)',
          extras: { wides: 2, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batters: {
            b1: [9, 3, 2, 0, 'run out (a3)'],
            b2: [11, 6, 0, 1, 'not out'],
            b3: [0, 0, 0, 0, 'not out'],
          },
          bowlers: { a1: ['1.0', 0, 14, 0], a2: ['0.3', 0, 8, 0] },
          fallOfWickets: '1-9 (0.4)',
        },
      ],
      summary: '21/2 (2.0) · 22/1 (1.3) · won by 2 wickets',
      winner: 'B',
      awards: { playerOfTheMatch: ['b2'], bestBatter: ['b2'], bestBowler: ['b2'] },
    },
  },
  {
    name: 'A tie settled by a super over',
    source: 'constructed',
    config: { ...base, playersPerSide: 3, oversPerInnings: 1, superOver: 'once' },
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'toss A bat',
      'innings a1 a2',
      'bowler b1',
      '1 1 1 1 1 1',
      'innings b1 b2',
      'bowler a1',
      '2 2 2 0 0 0',
      // Super over: the side that batted second bats first.
      'innings b2 b3',
      'bowler a2',
      '4! W',
      'next b1',
      '0 0 0 W',
      'innings a1 a3',
      'bowler b3',
      '4! 1',
    ],
    expected: {
      innings: [
        {
          score: '6/0 (1.0)',
          batters: { a1: [3, 3, 0, 0, 'not out'], a2: [3, 3, 0, 0, 'not out'] },
        },
        { score: '6/0 (1.0)' },
        { score: '4 (1.0)' },
        { score: '5/0 (0.2)' },
      ],
      summary: '6/0 (1.0) · 6/0 (1.0) · won the super over',
      winner: 'A',
    },
  },
  {
    name: 'Gully: three wides in a row, six and out, one tip one hand, last man stands',
    source: 'constructed',
    config: {
      ...base,
      playersPerSide: 6,
      allowConsecutiveOvers: true,
      freeHit: false,
      lastManStands: true,
      sixAndOut: 'out_no_runs',
      oneTipOneHand: true,
      consecutiveWides: { threshold: 3, penaltyRuns: 1 },
    },
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      'wd wd wd 6!',
      'next a3',
      'W:one_tip_one_hand:b2',
      '1 2 0 0',
      'bowler b1',
      '4! W',
      'innings b1 b2',
      'bowler a1',
      '6!',
      'next b3',
      '4! 4! 4!',
    ],
    expected: {
      innings: [
        {
          score: '11 (1.2)',
          extras: { wides: 3, noBalls: 0, byes: 0, legByes: 0, penalties: 1 },
          batters: {
            a1: [0, 1, 0, 0, 'six and out'],
            a2: [7, 6, 1, 0, 'b b1'],
            a3: [0, 1, 0, 0, 'one tip one hand b2 b b1'],
          },
          bowlers: { b1: ['1.2', 0, 10, 2] },
          fallOfWickets: '1-4 (0.1), 2-4 (0.2), 3-11 (1.2)',
        },
        {
          score: '12/1 (0.4)',
          batters: { b1: [0, 1, 0, 0, 'six and out'], b3: [12, 3, 3, 0, 'not out'] },
        },
      ],
      summary: '11 (1.2) · 12/1 (0.4) · won by 2 wickets',
      winner: 'B',
    },
  },
  {
    name: 'A maiden, a wicket off the last ball of an over, and a defended total',
    source: 'constructed',
    config: { ...base, playersPerSide: 4 },
    players: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      '0 0 0 0 0 W',
      // The new batter came in at the striker's end; the over ended, so a2 faces next.
      'next a3',
      'bowler b2',
      '4! 1 1 2 0 1',
      'innings b1 b2',
      'bowler a1',
      '1 1 1 1 0 0',
      'bowler a2',
      '2 0 W',
      'next b3',
      '1 0 0',
    ],
    expected: {
      innings: [
        {
          score: '9/1 (2.0)',
          batters: {
            a1: [0, 6, 0, 0, 'b b1'],
            a2: [8, 5, 1, 0, 'not out'],
            a3: [1, 1, 0, 0, 'not out'],
          },
          bowlers: { b1: ['1.0', 1, 0, 1], b2: ['1.0', 0, 9, 0] },
          fallOfWickets: '1-0 (0.6)',
        },
        { score: '7/1 (2.0)' },
      ],
      summary: '9/1 (2.0) · 7/1 (2.0) · won by 2 runs',
      winner: 'A',
    },
  },
  {
    name: 'A retired-hurt batter returns, a stumping off a wide, and a declaration',
    source: 'constructed',
    config: { ...base, playersPerSide: 4 },
    players: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      '1',
      'retire a1 hurt',
      'next a3',
      'wd+W:stumped:b4',
      'next a1',
      '4!',
      'declare',
      'innings b1 b2',
      'bowler a1',
      '6! 1',
    ],
    expected: {
      innings: [
        {
          score: '6/1 (0.2)',
          extras: { wides: 1, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batters: {
            a1: [5, 2, 1, 0, 'not out'],
            a2: [0, 0, 0, 0, 'st b4 b b1'],
            a3: [0, 0, 0, 0, 'not out'],
          },
          bowlers: { b1: ['0.2', 0, 6, 1] },
          fallOfWickets: '1-2 (0.1)',
        },
        { score: '7/0 (0.2)' },
      ],
      summary: '6/1 (0.2) · 7/0 (0.2) · won by 3 wickets',
      winner: 'B',
    },
  },
  {
    name: 'Super overs until there is a winner',
    source: 'constructed',
    config: { ...base, playersPerSide: 3, oversPerInnings: 1, superOver: 'until_decided' },
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      '1 1 1 1 1 1',
      'innings b1 b2',
      'bowler a1',
      '1 1 1 1 1 1',
      'innings b1 b2',
      'bowler a2',
      '4! 0 0 0 0 0',
      'innings a1 a2',
      'bowler b2',
      '2 2 0 0 0 0',
      // Tied again: the side that batted second in that super over bats first in the next.
      'innings a1 a3',
      'bowler b3',
      '6! 0 0 0 0 0',
      'innings b2 b3',
      'bowler a3',
      '0 0 0 0 0 0',
    ],
    expected: {
      innings: [
        { score: '6/0 (1.0)' },
        { score: '6/0 (1.0)' },
        { score: '4/0 (1.0)' },
        { score: '4/0 (1.0)' },
        { score: '6/0 (1.0)' },
        { score: '0/0 (1.0)' },
      ],
      summary: '6/0 (1.0) · 6/0 (1.0) · won the super over',
      winner: 'A',
    },
  },
  {
    name: 'A free hit carried over a wide, no-ball byes and a leg-bye boundary',
    source: 'constructed',
    config: { ...base, playersPerSide: 4, oversPerInnings: 1 },
    players: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] },
    script: [
      'innings A a1 a2',
      'bowler b1',
      'nb wd 0 nbb1 lb4! 1 0 0 0',
      'innings b1 b2',
      'bowler a1',
      '6! 4!',
    ],
    expected: {
      innings: [
        {
          score: '9/0 (1.0)',
          extras: { wides: 1, noBalls: 2, byes: 1, legByes: 4, penalties: 0 },
          batters: { a1: [0, 6, 0, 0, 'not out'], a2: [1, 2, 0, 0, 'not out'] },
          bowlers: { b1: ['1.0', 0, 4, 0] },
        },
        { score: '10/0 (0.2)' },
      ],
      summary: '9/0 (1.0) · 10/0 (0.2) · won by 3 wickets',
      winner: 'B',
    },
  },
];
