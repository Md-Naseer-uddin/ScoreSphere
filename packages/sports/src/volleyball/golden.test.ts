import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { volleyballBestBlocker, volleyballBestSpiker, volleyballMvp } from './awards.js';
import { volleyballEngine } from './engine.js';
import { volleyballGoldenLogs } from './golden/logs.js';
import { runVolleyballGoldenLog } from './golden/run.js';

describe.each(volleyballGoldenLogs)('golden log: $name', (log) => {
  const run = runVolleyballGoldenLog(log);
  const { state } = run.projection;

  it('reproduces the score and result', () => {
    const result = volleyballEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = result.winnerSide === undefined ? null : result.winnerSide === 0 ? 'A' : 'B';
    expect(winner).toBe(log.expected.winner);
  });

  it.runIf(log.expected.servers)('rotates the server on side-outs', () => {
    expect(run.servers[0]).toEqual(log.expected.servers);
  });

  it.runIf(log.expected.awards)('gives player awards from credited points', () => {
    const stats = volleyballEngine.stats(state);
    const who = (a: typeof volleyballMvp) =>
      a.compute(state, stats)?.recipients.map((r) => run.handles[r.participantId]);
    const awards = log.expected.awards!;
    if (awards.mvp) expect(who(volleyballMvp)).toEqual(awards.mvp);
    if (awards.bestSpiker) expect(who(volleyballBestSpiker)).toEqual(awards.bestSpiker);
    if (awards.bestBlocker) expect(who(volleyballBestBlocker)).toEqual(awards.bestBlocker);
  });

  it('replays to the same state', () => {
    const replayed = replay(volleyballEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
