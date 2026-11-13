import type { BadmintonSettings } from '../settings.js';

/**
 * Golden logs: a match script plus the expected scorecard (plan §4). Scripts use player
 * handles; the runner maps them to participant IDs and expands them into ledger events.
 *
 * Script steps:
 * - `start A` or `start A a1 b1` (doubles: server then receiver)
 * - rally winners as letters, with repeats: `AB*15 A*6`
 * - `undo`, `pause`, `resume`, `concede B retired`
 *
 * Except for the Law 11 example, these logs are constructed to cover edge cases. Logs
 * transcribed from real scoresheets get `source` set to where they came from.
 */
export interface BadmintonGoldenLog {
  name: string;
  source: string;
  config: BadmintonSettings;
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    games: [number, number][];
    winner: 'A' | 'B' | null;
    summary: string;
    /** Side metrics to check, by metric name. */
    stats?: Record<'A' | 'B', Record<string, number>>;
    /** Server, receiver and court before each rally, then after the last one. */
    service?: [string, string, 'right' | 'left'][];
  };
}

const bwf3x21 = {
  pointsToWin: 21,
  winBy: 2,
  cap: 30,
  gamesToWin: 2,
  intervalAt: 11,
  deciderChangeEndsAt: 11,
} as const;

export const badmintonGoldenLogs: BadmintonGoldenLog[] = [
  {
    name: 'Doubles service order (Laws of Badminton, Law 11 example)',
    source: 'BWF Laws of Badminton, Law 11 service-court rules, worked through rally by rally',
    config: { ...bwf3x21, discipline: 'doubles' },
    players: { A: ['a', 'b'], B: ['c', 'd'] },
    script: ['start A a c', 'A B A B B A A'],
    expected: {
      games: [[4, 3]],
      winner: null,
      summary: '4–3',
      service: [
        ['a', 'c', 'right'], // 0–0
        ['a', 'd', 'left'], // 1–0
        ['d', 'a', 'left'], // 1–1
        ['b', 'c', 'right'], // 2–1
        ['c', 'b', 'right'], // 2–2
        ['c', 'a', 'left'], // 2–3
        ['a', 'c', 'left'], // 3–3
        ['a', 'd', 'right'], // 4–3
      ],
    },
  },
  {
    name: 'Singles, straight games',
    source: 'constructed',
    config: { ...bwf3x21, discipline: 'singles' },
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'AB*15 A*6', 'start A', 'B*5 A*21'],
    expected: {
      games: [
        [21, 15],
        [21, 5],
      ],
      winner: 'A',
      summary: '21–15, 21–5',
      stats: {
        A: {
          games_won: 2,
          points_won: 42,
          service_points_won: 26,
          receiving_points_won: 16,
          longest_streak: 21,
        },
        B: {
          games_won: 0,
          points_won: 20,
          service_points_won: 4,
          receiving_points_won: 16,
          longest_streak: 5,
        },
      },
    },
  },
  {
    name: 'Singles, three games with deuce',
    source: 'constructed',
    config: { ...bwf3x21, discipline: 'singles' },
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'AB*19 A*2', 'start A', 'AB*19 B*2', 'start B', 'AB*20 A*2'],
    expected: {
      games: [
        [21, 19],
        [19, 21],
        [22, 20],
      ],
      winner: 'A',
      summary: '21–19, 19–21, 22–20',
    },
  },
  {
    name: 'One game decided at the 30-point cap',
    source: 'constructed',
    config: { ...bwf3x21, gamesToWin: 1, deciderChangeEndsAt: null, discipline: 'singles' },
    players: { A: ['a'], B: ['b'] },
    script: ['start B', 'AB*29 A'],
    expected: { games: [[30, 29]], winner: 'A', summary: '30–29' },
  },
  {
    name: 'Retirement during the second game',
    source: 'constructed',
    config: { ...bwf3x21, discipline: 'doubles' },
    players: { A: ['a', 'b'], B: ['c', 'd'] },
    script: ['start A a c', 'A*21', 'start A b d', 'B*3', 'concede B retired'],
    expected: {
      games: [
        [21, 0],
        [0, 3],
      ],
      winner: 'A',
      summary: '21–0, 0–3 (retired)',
    },
  },
  {
    name: '3×15: two-point lead at 14–all, cap at 21',
    source: 'constructed',
    config: {
      pointsToWin: 15,
      winBy: 2,
      cap: 21,
      gamesToWin: 2,
      intervalAt: null,
      deciderChangeEndsAt: null,
      discipline: 'singles',
    },
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'AB*14 B*2', 'start B', 'BA*20 B'],
    expected: {
      games: [
        [14, 16],
        [20, 21],
      ],
      winner: 'B',
      summary: '14–16, 20–21',
    },
  },
];
