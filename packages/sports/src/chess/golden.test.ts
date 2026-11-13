import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { chessEngine } from './engine.js';
import { chessGoldenLogs } from './golden/logs.js';
import { runChessGoldenLog } from './golden/run.js';

describe.each(chessGoldenLogs)('golden log: $name', (log) => {
  const run = runChessGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the clocks and the result', () => {
    if (log.expected.remaining) {
      expect(state.clocks.map((c) => c.remainingMs / 1000)).toEqual(log.expected.remaining);
    }
    const result = chessEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = result.winnerSide === undefined ? null : result.winnerSide === 0 ? 'A' : 'B';
    expect(winner).toBe(log.expected.winner);
  });

  it('replays to the same clocks', () => {
    const replayed = replay(chessEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
