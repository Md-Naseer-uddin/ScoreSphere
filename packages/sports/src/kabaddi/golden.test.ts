import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { kabaddiEngine } from './engine.js';
import { kabaddiGoldenLogs } from './golden/logs.js';
import { runKabaddiGoldenLog } from './golden/run.js';

describe.each(kabaddiGoldenLogs)('golden log: $name', (log) => {
  const run = runKabaddiGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the result', () => {
    const result = kabaddiEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
  });

  it.skipIf(!log.expected.allOuts)('counts all outs and players on the mat', () => {
    expect(state.allOuts).toEqual(log.expected.allOuts);
    expect(state.onMat).toEqual(log.expected.onMat);
  });

  it.skipIf(!log.expected.players)('reproduces player statistics', () => {
    const stats = kabaddiEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.players ?? {})) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = stats.find((s) => s.participantId === run.ids[handle] && s.metric === metric);
        expect([handle, metric, row?.value ?? 0]).toEqual([handle, metric, value]);
      }
    }
  });

  it('replays to the same state', () => {
    const replayed = replay(kabaddiEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
