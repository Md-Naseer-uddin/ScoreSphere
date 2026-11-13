import type { ChessSettings } from '../settings.js';

/**
 * Chess clock golden logs. Times are seconds after the previous event:
 * `start A` (A plays White), `press A 12.5`, `pause 20`, `resume 300`,
 * `flag A loss 6`, `result resignation B 4`, `result agreement - 3`.
 */
export interface ChessGoldenLog {
  name: string;
  source: string;
  config: ChessSettings;
  script: string[];
  expected: {
    /** Clock times after the script, in seconds, side A then side B. */
    remaining?: [number, number];
    summary: string;
    winner: 'A' | 'B' | null;
  };
}

const tc = (
  baseSec: number,
  incSec = 0,
  delaySec = 0,
  stages: { afterMoves: number; addSec: number }[] = [],
) => ({
  timeControl: {
    baseMs: baseSec * 1000,
    incrementMs: incSec * 1000,
    delayMs: delaySec * 1000,
    stages: stages.map((s) => ({ afterMoves: s.afterMoves, addMs: s.addSec * 1000 })),
  },
});

export const chessGoldenLogs: ChessGoldenLog[] = [
  {
    name: 'Blitz with an increment, ending in resignation',
    source: 'constructed',
    config: tc(180, 2),
    script: ['start A', 'press A 10', 'press B 20', 'press A 5', 'result resignation A 7'],
    expected: { remaining: [169, 155], summary: '1–0 (resignation)', winner: 'A' },
  },
  {
    name: 'A simple delay makes quick moves free',
    source: 'constructed',
    config: tc(60, 0, 5),
    script: ['start B', 'press B 3', 'press A 8', 'result agreement - 1'],
    expected: { remaining: [57, 60], summary: '½–½ (agreed draw)', winner: null },
  },
  {
    name: 'Time added after a set number of moves',
    source: 'constructed',
    config: tc(60, 0, 0, [{ afterMoves: 2, addSec: 30 }]),
    script: ['start A', 'press A 10', 'press B 10', 'press A 10', 'result checkmate A 2'],
    expected: { remaining: [70, 48], summary: '1–0 (checkmate)', winner: 'A' },
  },
  {
    name: 'A pause does not cost the player to move',
    source: 'constructed',
    config: tc(60),
    script: [
      'start A',
      'press A 10',
      'press B 5',
      'pause 20',
      'resume 300',
      'press A 10',
      'result agreement - 1',
    ],
    expected: { remaining: [20, 54], summary: '½–½ (agreed draw)', winner: null },
  },
  {
    name: 'Losing on time',
    source: 'constructed',
    config: tc(10),
    script: ['start A', 'press A 5', 'press B 3', 'flag A loss 6'],
    expected: { remaining: [0, 7], summary: '0–1 (time)', winner: 'B' },
  },
];
