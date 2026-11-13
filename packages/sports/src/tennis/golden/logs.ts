import type { TennisSettings } from '../settings.js';

/**
 * Tennis golden logs. Script lines: `start A` (singles) or `start A a1 b2` (doubles: who
 * serves first for side A, then side B); points as `A`/`B`; `gA` is a love game for A;
 * any token may repeat with `*n`; `concede B retired`.
 */
export interface TennisGoldenLog {
  name: string;
  source: string;
  config: TennisSettings;
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    /** Who served first in each game, in order. */
    servers?: string[];
    /** Who served each point of the first tie-break. */
    tiebreakServers?: string[];
    breaks?: [number, number];
  };
}

const bo3: TennisSettings = {
  discipline: 'singles',
  setsToWin: 2,
  gamesPerSet: 6,
  set: { type: 'tiebreak', points: 7 },
  finalSet: { type: 'tiebreak', points: 7 },
  noAd: false,
};

export const tennisGoldenLogs: TennisGoldenLog[] = [
  {
    name: 'Straight sets, service alternating every game',
    source: 'constructed',
    config: bo3,
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'gA gB gA gB gA gB gA gB gA gA', 'gA gA gB gA gB gA gB gA gA'],
    expected: {
      summary: '6–4, 6–3',
      winner: 'A',
      servers: [
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
        'b',
        'a',
      ],
      // Each game was won by whoever won its points; every game A won on B's serve is a break.
      breaks: [5, 3],
    },
  },
  {
    name: 'A tie-break set, a deuce game and a deciding set',
    source: 'constructed',
    config: bo3,
    players: { A: ['a'], B: ['b'] },
    script: [
      'start A',
      'gA gB',
      'gA gB',
      'gA gB',
      'gA gB',
      'gA gB',
      'gA gB',
      // Tie-break at 6–6: 5–5, then two points to A.
      'AB*5 A A',
      // Set 2 opens with a deuce game A wins on B's serve, then B takes six games.
      'A A A B B B A B A A',
      'gB*6',
      'gA*6',
    ],
    expected: {
      summary: '7–6(5), 1–6, 6–0',
      winner: 'A',
      tiebreakServers: ['a', 'b', 'b', 'a', 'a', 'b', 'b', 'a', 'a', 'b', 'b', 'a'],
    },
  },
  {
    name: 'A match tie-break instead of a third set',
    source: 'constructed',
    config: { ...bo3, finalSet: { type: 'match_tiebreak', points: 10 } },
    players: { A: ['a'], B: ['b'] },
    script: ['start B', 'gA*6', 'gB*6', 'A*9 B*9 A A'],
    expected: { summary: '6–0, 0–6, [11–9]', winner: 'A' },
  },
  {
    name: 'No-ad deciding point in short sets',
    source: 'constructed',
    config: {
      ...bo3,
      gamesPerSet: 4,
      noAd: true,
      finalSet: { type: 'match_tiebreak', points: 10 },
    },
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'A A A B B B A', 'gA*3', 'gA*4'],
    expected: { summary: '4–0, 4–0', winner: 'A' },
  },
  {
    name: 'Doubles service order',
    source: 'constructed',
    config: { ...bo3, discipline: 'doubles' },
    players: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
    script: ['start A a1 b2', 'gA gB gA gB gA'],
    expected: { summary: '3–2', winner: null, servers: ['a1', 'b2', 'a2', 'b1', 'a1'] },
  },
  {
    name: 'Retirement mid-set',
    source: 'constructed',
    config: bo3,
    players: { A: ['a'], B: ['b'] },
    script: ['start A', 'gA*6', 'gB gB', 'concede A retired'],
    expected: { summary: '6–0, 0–2 (retired)', winner: 'B' },
  },
];
