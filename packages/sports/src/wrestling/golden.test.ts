import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { classificationPoints, wrestlingEngine } from './engine.js';
import { wrestlingGoldenLogs } from './golden/logs.js';
import { runWrestlingGoldenLog } from './golden/run.js';

describe.each(wrestlingGoldenLogs)('golden log: $name', (log) => {
  const run = runWrestlingGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the result and classification points', () => {
    const result = wrestlingEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
    if (log.expected.classification)
      expect(classificationPoints(state)).toEqual(log.expected.classification);
  });

  it('replays to the same state', () => {
    const replayed = replay(wrestlingEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
