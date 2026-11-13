import { badmintonEngine } from '@scoresphere/sports';
import { badmintonGoldenLogs, runGoldenLog } from '@scoresphere/sports/golden';
import { describe, expect, it } from 'vitest';

/** The server's build of the engines must reproduce every golden log (plan D19). */
describe.each(badmintonGoldenLogs)('server build: $name', (log) => {
  it('reproduces the expected result', () => {
    const { projection } = runGoldenLog(log);
    const result = badmintonEngine.result(projection.state);
    expect(result.summary).toBe(log.expected.summary);
    expect(result.winnerSide ?? null).toBe(
      log.expected.winner === null ? null : log.expected.winner === 'A' ? 0 : 1,
    );
  });
});
