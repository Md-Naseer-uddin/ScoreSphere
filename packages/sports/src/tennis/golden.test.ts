import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { tennisEngine } from './engine.js';
import { tennisGoldenLogs } from './golden/logs.js';
import { runTennisGoldenLog } from './golden/run.js';

describe.each(tennisGoldenLogs)('golden log: $name', (log) => {
  const run = runTennisGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the score and result', () => {
    const result = tennisEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = result.winnerSide === undefined ? null : result.winnerSide === 0 ? 'A' : 'B';
    expect(winner).toBe(log.expected.winner);
  });

  it.runIf(log.expected.servers)('rotates service game by game', () => {
    expect(run.gameServers).toEqual(log.expected.servers);
  });

  it.runIf(log.expected.tiebreakServers)('serves one point, then two each, in a tie-break', () => {
    // The tie-break follows twelve love games (48 points) in this log.
    expect(run.pointServers.slice(48, 60)).toEqual(log.expected.tiebreakServers);
  });

  it.runIf(log.expected.breaks)('counts breaks of serve', () => {
    expect(state.stats.breaks).toEqual(log.expected.breaks);
  });

  it('replays to the same state', () => {
    const replayed = replay(tennisEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
