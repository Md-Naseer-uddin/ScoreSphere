import type { Rule } from '@scoresphere/contracts';
import { carromPresets, type CarromSettings } from '../settings.js';

/**
 * Carrom golden logs: board results and the score they must produce (plan §4).
 * Expectations were worked out by hand from the Laws, independently of the engine.
 *
 * Script lines: `start A` (A breaks first), `board A 5` (A wins with 5 of B's coins left),
 * `board A 5 queen A` (A covered the queen), `foul B`, `bonus A 2`, `concede B retired`.
 */
export interface CarromGoldenLog {
  name: string;
  source: string;
  config: CarromSettings;
  rules?: Rule[];
  script: string[];
  expected: { summary: string; winner: 'A' | 'B' | null; boards?: number[] };
}

const config = (key: string): CarromSettings => carromPresets.find((p) => p.key === key)!.config;

export const carromGoldenLogs: CarromGoldenLog[] = [
  {
    name: 'The queen counts for the board winner below 22',
    source: 'constructed',
    config: config('one-game-25'),
    script: ['start A', 'board A 9 queen A', 'board B 4', 'board A 6 queen A', 'board A 2 queen A'],
    // 12, 4, 9, then A is on 21 (below 22), so 2 + 3: 26.
    expected: { summary: '26–4', winner: 'A', boards: [12, 4, 9, 5] },
  },
  {
    name: 'No queen points at 22 or more, nor when the loser covered her',
    source: 'constructed',
    config: config('one-game-25'),
    script: [
      'start B',
      'board A 9 queen A',
      'board A 9 queen B',
      'board B 1',
      'board A 1',
      'board A 2 queen A',
      'board A 1',
    ],
    expected: { summary: '25–1', winner: 'A', boards: [12, 9, 1, 1, 2, 1] },
  },
  {
    name: 'After 8 boards the leader wins the game',
    source: 'constructed',
    config: config('one-game-25'),
    script: [
      'start A',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 2',
    ],
    expected: { summary: '4–5', winner: 'B' },
  },
  {
    name: 'Level after 8 boards: an extra board decides',
    source: 'constructed',
    config: config('one-game-25'),
    script: [
      'start A',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 1',
      'board A 1',
      'board B 1',
      'board A 3',
    ],
    expected: { summary: '7–4', winner: 'A' },
  },
  {
    name: 'Best of three games, with a foul and a retirement-free finish',
    source: 'constructed',
    config: config('icf-best-of-3'),
    script: [
      'start A',
      'board A 9 queen A',
      'board A 9 queen A',
      'foul B',
      'board A 1',
      'board B 9 queen B',
      'board B 9 queen B',
      'board B 1',
      'board A 9 queen A',
      'board A 9 queen A',
      'board A 1',
    ],
    expected: { summary: '25–0, 0–25, 25–0', winner: 'A' },
  },
];
