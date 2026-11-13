import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { cricketBestBatter, cricketBestBowler, cricketPlayerOfTheMatch } from './awards.js';
import { ballText, cricketEngine, howOut, oversText } from './engine.js';
import { cricketGoldenLogs } from './golden/logs.js';
import { runCricketGoldenLog } from './golden/run.js';

describe.each(cricketGoldenLogs)('golden log: $name', (log) => {
  const run = runCricketGoldenLog(log);
  const { state } = run.projection;
  const bpo = log.config.ballsPerOver;
  const name = (id: string | null) => (id ? (run.handles[id] ?? '?') : '?');

  it('reproduces each innings', () => {
    expect(state.innings).toHaveLength(log.expected.innings.length);
    log.expected.innings.forEach((expected, i) => {
      const inn = state.innings[i]!;
      const wickets = inn.wickets >= inn.maxWickets ? '' : `/${inn.wickets}`;
      expect(`${inn.runs}${wickets} (${oversText(inn.legalBalls, bpo)})`).toBe(expected.score);
      if (expected.extras) expect(inn.extras).toEqual(expected.extras);
      for (const [handle, row] of Object.entries(expected.batters ?? {})) {
        const card = inn.batters[run.ids[handle]!]!;
        expect([handle, card.runs, card.balls, card.fours, card.sixes, howOut(card, name)]).toEqual(
          [handle, ...row],
        );
      }
      for (const [handle, row] of Object.entries(expected.bowlers ?? {})) {
        const card = inn.bowlers[run.ids[handle]!]!;
        expect([
          handle,
          oversText(card.legalBalls, bpo),
          card.maidens,
          card.runs,
          card.wickets,
        ]).toEqual([handle, ...row]);
      }
      if (expected.fallOfWickets) {
        const fow = inn.fallOfWickets
          .map((f) => `${f.wicket}-${f.runs} (${ballText(f.legalBalls, bpo)})`)
          .join(', ');
        expect(fow).toBe(expected.fallOfWickets);
      }
    });
  });

  it('reproduces the result', () => {
    const result = cricketEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = result.winnerSide === undefined ? null : result.winnerSide === 0 ? 'A' : 'B';
    expect(winner).toBe(log.expected.winner);
    expect(run.projection.status).toBe('completed');
  });

  it.runIf(log.expected.awards)('gives the expected awards', () => {
    const stats = cricketEngine.stats(state);
    const who = (a: typeof cricketBestBatter) =>
      a.compute(state, stats)?.recipients.map((r) => name(r.participantId));
    const awards = log.expected.awards!;
    if (awards.playerOfTheMatch)
      expect(who(cricketPlayerOfTheMatch)).toEqual(awards.playerOfTheMatch);
    if (awards.bestBatter) expect(who(cricketBestBatter)).toEqual(awards.bestBatter);
    if (awards.bestBowler) expect(who(cricketBestBowler)).toEqual(awards.bestBowler);
  });

  it('replays to the same state', () => {
    for (const lenient of [false, true]) {
      const replayed = replay(cricketEngine, run.events, { lenient });
      expect(replayed.ok && replayed.value.state).toEqual(state);
    }
  });
});
