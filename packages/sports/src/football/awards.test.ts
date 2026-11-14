import { describe, expect, it } from 'vitest';
import { footballPlayerOfTheMatch, footballTopScorer } from './awards.js';
import { footballEngine } from './engine.js';
import { footballGoldenLogs } from './golden/logs.js';
import { runFootballGoldenLog } from './golden/run.js';
import { tournamentRules } from '../tournaments/rules.js';

describe('football awards', () => {
  it('give Player of the Match for goals and assists, preferring the winning team', () => {
    const run = runFootballGoldenLog(footballGoldenLogs[0]!);
    const stats = footballEngine.stats(run.projection.state);
    // a1 scored (2) and a2 assisted (1); b3's penalty also makes 2, but A won.
    const potm = footballPlayerOfTheMatch.compute(run.projection.state, stats);
    expect(potm?.recipients.map((r) => run.handles[r.participantId])).toEqual(['a1']);
    expect(potm?.metrics).toEqual({ goals: 1, assists: 0 });
    const top = footballTopScorer.compute(run.projection.state, stats);
    expect(top?.recipients.map((r) => run.handles[r.participantId])).toEqual(['a1']);
  });

  it('give nothing when no scorer was recorded', () => {
    const run = runFootballGoldenLog(footballGoldenLogs[2]!);
    const stats = footballEngine.stats(run.projection.state);
    expect(footballTopScorer.compute(run.projection.state, stats)).toBeNull();
  });

  it('count goals, not shootout kicks, in tournament totals', () => {
    const run = runFootballGoldenLog(footballGoldenLogs[1]!);
    const rules = tournamentRules('football')!;
    expect(rules.totals(run.projection.state, 0)).toEqual({ goalsFor: 1, goalsAgainst: 1 });
  });
});
