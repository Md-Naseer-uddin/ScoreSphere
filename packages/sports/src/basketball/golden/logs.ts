import type { Rule } from '@scoresphere/contracts';
import { basketballPresets, type BasketballSettings } from '../settings.js';

/**
 * Basketball golden logs: a script of game events and the result it must produce (plan §4).
 * Expectations were worked out by hand from the Rules, independently of the engine.
 *
 * Script lines (players are `a1…` for side A and `b1…` for side B):
 * - `start`, `end` a period; `stop`, `go` stop and start the game clock
 * - `2 A a1 [assist a2]`, `3 B b1`, `1 A a1` (free throw), `2 A` (scorer not recorded)
 * - `miss2 A a1`, `miss1 B b2`
 * - `foul A a1 [technical|unsportsmanlike|disqualifying]`, `foul A -` (team foul only)
 * - `timeout A`, `reb A a1`, `stl A a1`, `blk A a1`, `tov A a1`, `whistle`
 */
export interface BasketballGoldenLog {
  name: string;
  source: string;
  config: BasketballSettings;
  rules?: Rule[];
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    periodScores?: [number, number][];
    /** Players out of the game, in order. */
    out?: string[];
    players?: Record<string, Record<string, number>>;
  };
}

const config = (key: string): BasketballSettings =>
  basketballPresets.find((p) => p.key === key)!.config;

export const basketballGoldenLogs: BasketballGoldenLog[] = [
  {
    name: 'Four quarters: free throws, threes, a disqualification for two technical-type fouls',
    source: 'constructed',
    config: config('fiba-4x10'),
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'start',
      '2 A a1 assist a2',
      '3 B b1',
      'foul A a2',
      '1 B b1',
      'miss1 B b1',
      'reb A a3',
      '3 A a2',
      'end',
      'start',
      '2 B b2',
      '2 B b2',
      'timeout A',
      'go',
      '2 A a1',
      'end',
      'start',
      'foul A a1 technical',
      // One technical and one unsportsmanlike foul: a1 is out of the game.
      'foul A a1 unsportsmanlike',
      '1 B b1',
      '1 B b1',
      'end',
      'start',
      '3 A a2',
      '3 A a2',
      '2 B b1',
      'stl A a3',
      'tov B b2',
      'blk A a3',
      'end',
    ],
    expected: {
      summary: '13–12',
      winner: 'A',
      periodScores: [
        [5, 4],
        [2, 4],
        [0, 2],
        [6, 2],
      ],
      out: ['a1'],
      players: {
        a1: { points: 4, two_pointers: 2, fouls: 2 },
        a2: { points: 9, three_pointers: 3, assists: 1, fouls: 1 },
        a3: { rebounds: 1, steals: 1, blocks: 1 },
        b1: { points: 8, free_throws_made: 3, free_throws_attempted: 4, missed_shots: 1 },
        b2: { points: 4, turnovers: 1 },
      },
    },
  },
  {
    name: 'Level after four quarters and after the first overtime, won in the second',
    source: 'constructed',
    config: config('school-4x8'),
    players: { A: ['a1'], B: ['b1'] },
    script: [
      'start',
      '2 A a1',
      'end',
      'start',
      '2 B b1',
      'end',
      'start',
      'end',
      'start',
      'end',
      'start',
      '3 A a1',
      '3 B b1',
      'end',
      'start',
      '2 B b1',
      'end',
    ],
    expected: {
      summary: '5–7 (2OT)',
      winner: 'B',
      periodScores: [
        [2, 0],
        [0, 2],
        [0, 0],
        [0, 0],
        [3, 3],
        [0, 2],
      ],
    },
  },
  {
    name: 'A player fouls out on their fifth foul, and team fouls reach the penalty',
    source: 'constructed',
    config: config('fiba-4x10'),
    players: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
    script: [
      'start',
      'foul B b1',
      'foul B b1',
      'foul B b1',
      'foul B b1',
      // The team's fourth foul: from now on every foul brings free throws.
      '1 A a1',
      '1 A a1',
      'foul B b1',
      '1 A a2',
      'miss1 A a2',
      'end',
      'start',
      '2 B b2',
      'end',
      'start',
      'end',
      'start',
      'end',
    ],
    expected: {
      summary: '3–2',
      winner: 'A',
      out: ['b1'],
      players: {
        b1: { fouls: 5 },
        a1: { free_throws_made: 2, free_throws_attempted: 2 },
        a2: { free_throws_made: 1, free_throws_attempted: 2 },
      },
    },
  },
];
