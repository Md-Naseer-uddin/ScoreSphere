import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { khoKhoEngine } from './engine.js';
import { khoKhoGoldenLogs } from './golden/logs.js';
import { runKhoKhoGoldenLog } from './golden/run.js';

describe.each(khoKhoGoldenLogs)('golden log: $name', (log) => {
  const run = runKhoKhoGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the result and the points by turn', () => {
    const result = khoKhoEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
    if (log.expected.turnPoints) expect(state.turnPoints).toEqual(log.expected.turnPoints);
  });

  it.skipIf(!log.expected.players)('reproduces player statistics', () => {
    const stats = khoKhoEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.players ?? {})) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = stats.find((s) => s.participantId === run.ids[handle] && s.metric === metric);
        expect([handle, metric, row?.value ?? 0]).toEqual([handle, metric, value]);
      }
    }
  });

  it('replays to the same state', () => {
    const replayed = replay(khoKhoEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
