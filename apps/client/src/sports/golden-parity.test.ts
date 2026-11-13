import { badmintonEngine, cricketEngine } from '@scoresphere/sports';
import {
  badmintonGoldenLogs,
  cricketGoldenLogs,
  runCricketGoldenLog,
  runGoldenLog,
} from '@scoresphere/sports/golden';
import { describe, expect, it } from 'vitest';

/** The client's build of the engines must reproduce every golden log (plan D19). */
describe.each(badmintonGoldenLogs)('client build: $name', (log) => {
  it('reproduces the expected result', () => {
    const { projection } = runGoldenLog(log);
    const result = badmintonEngine.result(projection.state);
    expect(result.summary).toBe(log.expected.summary);
    expect(result.winnerSide ?? null).toBe(
      log.expected.winner === null ? null : log.expected.winner === 'A' ? 0 : 1,
    );
  });
});

describe.each(cricketGoldenLogs)('client build: $name', (log) => {
  it('reproduces the expected result', () => {
    const { projection } = runCricketGoldenLog(log);
    expect(cricketEngine.result(projection.state).summary).toBe(log.expected.summary);
  });
});
