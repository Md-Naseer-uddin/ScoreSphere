import { describe, expect, it } from 'vitest';
import { cricketEngine } from '../cricket/engine.js';
import { cricketGoldenLogs } from '../cricket/golden/logs.js';
import { runCricketGoldenLog } from '../cricket/golden/run.js';
import { aggregatePlayerStats, playerAwardWinners, tournamentRules } from './rules.js';
import { computeStandings, type FixtureResult } from './standings.js';

const win = (a: string, b: string, totals: FixtureResult['totals'] = [{}, {}]): FixtureResult => ({
  side1: a,
  side2: b,
  winner: a,
  totals,
});

describe('standings', () => {
  it('ranks by points, then tie-breaks, then head-to-head', () => {
    // A, B and C each win once; game difference separates them.
    const results: FixtureResult[] = [
      win('A', 'B', [
        { gamesFor: 2, gamesAgainst: 0 },
        { gamesFor: 0, gamesAgainst: 2 },
      ]),
      win('B', 'C', [
        { gamesFor: 2, gamesAgainst: 1 },
        { gamesFor: 1, gamesAgainst: 2 },
      ]),
      win('C', 'A', [
        { gamesFor: 2, gamesAgainst: 1 },
        { gamesFor: 1, gamesAgainst: 2 },
      ]),
    ];
    const table = computeStandings(['A', 'B', 'C'], results, { win: 1, draw: 0, loss: 0 }, [
      'game_difference',
    ]);
    expect(table.map((r) => [r.entryId, r.points, r.tieBreaks.game_difference])).toEqual([
      ['A', 1, 1],
      ['C', 1, 0],
      ['B', 1, -1],
    ]);
  });

  it('uses head-to-head when everything else is level', () => {
    const results = [win('B', 'A'), win('C', 'D'), win('A', 'C'), win('D', 'B')];
    const table = computeStandings(['A', 'B', 'C', 'D'], results, { win: 2, draw: 1, loss: 0 }, []);
    // All on 2 points: A beat C, B beat A, D beat B, C beat D — a cycle, so seeding decides.
    expect(table.map((r) => r.entryId)).toEqual(['A', 'B', 'C', 'D']);
    const two = computeStandings(['A', 'B'], [win('B', 'A')], { win: 2, draw: 1, loss: 0 }, []);
    expect(two.map((r) => r.entryId)).toEqual(['B', 'A']);
  });

  it('works out cricket net run rate with the all-out rule', () => {
    const rules = tournamentRules('cricket')!;
    // Golden log 1: A 21/2 in 2 overs, B 22/1 in 1.3 overs.
    const run = runCricketGoldenLog(cricketGoldenLogs[0]!);
    const totals: FixtureResult['totals'] = [
      rules.totals(run.projection.state, 0),
      rules.totals(run.projection.state, 1),
    ];
    expect(totals[1]).toEqual({ runsFor: 22, ballsFaced: 9, runsAgainst: 21, ballsBowled: 12 });
    const table = computeStandings(
      ['A', 'B'],
      [{ side1: 'A', side2: 'B', winner: 'B', totals }],
      rules.points,
      rules.tieBreaks,
    );
    // B: 22/1.5 − 21/2 = 14.667 − 10.5
    expect(table[0]).toMatchObject({ entryId: 'B', points: 2 });
    expect(table[0]!.tieBreaks.net_run_rate).toBeCloseTo(4.167, 3);
  });

  it('counts chess draws as half points and breaks ties with Sonneborn-Berger', () => {
    const rules = tournamentRules('chess')!;
    const draw = (a: string, b: string): FixtureResult => ({
      side1: a,
      side2: b,
      winner: null,
      totals: [{}, {}],
    });
    const results = [win('A', 'C'), draw('B', 'C'), draw('A', 'B')];
    const table = computeStandings(['A', 'B', 'C'], results, rules.points, rules.tieBreaks);
    expect(table.map((r) => [r.entryId, r.points])).toEqual([
      ['A', 1.5],
      ['B', 1],
      ['C', 0.5],
    ]);
  });
});

describe('player awards', () => {
  it('sums statistics by roster member and applies the tie-break', () => {
    const run = runCricketGoldenLog(cricketGoldenLogs[0]!);
    const stats = cricketEngine.stats(run.projection.state);
    const rosterOf = (participantId: string) => `roster-${run.handles[participantId]}`;
    const rules = tournamentRules('cricket')!;
    const totals = aggregatePlayerStats(
      [
        { stats, rosterOf },
        { stats, rosterOf },
      ],
      rules.derive,
    );
    expect(totals.get('roster-b2')).toMatchObject({ runs: 22, wickets: 2, impact_points: 62 });
    const bestBatter = playerAwardWinners(
      rules.playerAwards.find((a) => a.key === 'best-batter')!,
      totals,
    );
    expect(bestBatter).toEqual({
      rosterMemberIds: ['roster-b2'],
      metrics: { runs: 22, balls_faced: 12 },
    });
  });
});
