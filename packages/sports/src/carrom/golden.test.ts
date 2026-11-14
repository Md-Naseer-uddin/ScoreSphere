import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { carromEngine } from './engine.js';
import { carromGoldenLogs } from './golden/logs.js';
import { runCarromGoldenLog } from './golden/run.js';

describe.each(carromGoldenLogs)('golden log: $name', (log) => {
  const run = runCarromGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the result', () => {
    const result = carromEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
    if (log.expected.boards)
      expect(state.games[0]!.boards.map((b) => b.points)).toEqual(log.expected.boards);
  });

  it('replays to the same state', () => {
    const replayed = replay(carromEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
