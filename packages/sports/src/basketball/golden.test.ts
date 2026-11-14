import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { basketballEngine } from './engine.js';
import { basketballGoldenLogs } from './golden/logs.js';
import { runBasketballGoldenLog } from './golden/run.js';

describe.each(basketballGoldenLogs)('golden log: $name', (log) => {
  const run = runBasketballGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the result', () => {
    const result = basketballEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
  });

  it.skipIf(!log.expected.periodScores)('reproduces the score by period', () => {
    expect(state.periodScores).toEqual(log.expected.periodScores);
  });

  it.skipIf(!log.expected.out)('puts the right players out of the game', () => {
    expect(state.disqualified.map((id) => run.handles[id])).toEqual(log.expected.out);
  });

  it.skipIf(!log.expected.players)('reproduces player statistics', () => {
    const stats = basketballEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.players ?? {})) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = stats.find((s) => s.participantId === run.ids[handle] && s.metric === metric);
        expect([handle, metric, row?.value ?? 0]).toEqual([handle, metric, value]);
      }
    }
  });

  it('replays to the same state', () => {
    const replayed = replay(basketballEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
