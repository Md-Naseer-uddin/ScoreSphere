import type { Rule } from '@scoresphere/contracts';
import { khoKhoPresets, type KhoKhoSettings } from '../settings.js';

/**
 * Kho-kho golden logs: a script of turns and outs and the result it must produce (plan §4).
 *
 * Script lines (players are `a1…` for side A and `b1…` for side B):
 * - `start A` (A chases first), `start` (the next turn), `end`, `stop`, `go`
 * - `out touch a1 b2` (chaser a1 touched defender b2), `out out_of_field - b3`, `out touch`
 * - `tech B 1`, `whistle`
 */
export interface KhoKhoGoldenLog {
  name: string;
  source: string;
  config: KhoKhoSettings;
  rules?: Rule[];
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    turnPoints?: [number, number][];
    players?: Record<string, Record<string, number>>;
  };
}

const config = (key: string): KhoKhoSettings => khoKhoPresets.find((p) => p.key === key)!.config;

export const khoKhoGoldenLogs: KhoKhoGoldenLog[] = [
  {
    name: 'Two innings: a batch put out, pole dives and a technical point',
    source: 'constructed',
    config: config('two-innings-7'),
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'start A',
      'out touch a1 b1',
      'out pole_dive a2 b2',
      // The first batch is all out; the next batch comes on.
      'out out_of_field - b3',
      'out touch a1 b1',
      'end',
      'start',
      'out touch b1 a1',
      'out touch b2 a2',
      'end',
      'start',
      'out touch a3 b1',
      'end',
      'start',
      'out touch b1 a3',
      'out late_entry - a1',
      'tech A 1',
      'end',
    ],
    expected: {
      summary: '6–4',
      winner: 'A',
      turnPoints: [
        [4, 0],
        [0, 2],
        [1, 0],
        [1, 2],
      ],
      players: {
        a1: { outs_made: 2, times_out: 2 },
        a2: { outs_made: 1, pole_dives: 1, times_out: 1 },
        a3: { outs_made: 1, times_out: 1 },
        b1: { outs_made: 2, times_out: 3 },
      },
    },
  },
  {
    name: 'One innings, the second team chasing first, ends level',
    source: 'constructed',
    config: config('school-5'),
    players: { A: ['a1'], B: ['b1'] },
    script: ['start B', 'out touch', 'end', 'start', 'out touch', 'end'],
    expected: {
      summary: '1–1',
      winner: null,
      turnPoints: [
        [0, 1],
        [1, 0],
      ],
    },
  },
];
