import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { badmintonEngine } from './engine.js';
import { badmintonGoldenLogs } from './golden/logs.js';
import { runGoldenLog } from './golden/run.js';

describe.each(badmintonGoldenLogs)('golden log: $name', (log) => {
  const run = runGoldenLog(log);
  const { state } = run.projection;
  const letter = (side: 0 | 1 | undefined) => (side === undefined ? null : side === 0 ? 'A' : 'B');

  it('reproduces the game scores and result', () => {
    expect(state.games.filter((g) => g.points[0] + g.points[1] > 0).map((g) => g.points)).toEqual(
      log.expected.games,
    );
    const result = badmintonEngine.result(state);
    expect(letter(result.winnerSide)).toBe(log.expected.winner);
    expect(result.summary).toBe(log.expected.summary);
    expect(run.projection.status).toBe(log.expected.winner ? 'completed' : 'live');
  });

  it.runIf(log.expected.stats)('reproduces the side statistics', () => {
    const stats = badmintonEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.stats!)) {
      const side = handle === 'A' ? 0 : 1;
      for (const [metric, value] of Object.entries(metrics)) {
        const record = stats.find(
          (s) => s.metric === metric && s.side === side && !s.participantId,
        );
        expect({ handle, metric, value: record?.value }).toEqual({ handle, metric, value });
      }
    }
  });

  it.runIf(log.expected.service)('serves from the right court to the right player', () => {
    const byId = Object.fromEntries(Object.entries(run.ids).map(([h, id]) => [id, h]));
    const actual = run.service.map((v) =>
      v ? [byId[v.serverId], byId[v.receiverId], v.court] : null,
    );
    expect(actual).toEqual(log.expected.service);
  });

  it('replays to the same state, strictly and leniently', () => {
    for (const lenient of [false, true]) {
      const replayed = replay(badmintonEngine, run.events, { lenient });
      expect(replayed.ok && replayed.value.state).toEqual(state);
    }
  });
});
