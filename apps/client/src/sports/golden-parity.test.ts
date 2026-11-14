import {
  badmintonEngine,
  basketballEngine,
  chessEngine,
  cricketEngine,
  footballEngine,
  hockeyEngine,
  kabaddiEngine,
  khoKhoEngine,
  tennisEngine,
  volleyballEngine,
  wrestlingEngine,
} from '@scoresphere/sports';
import {
  badmintonGoldenLogs,
  basketballGoldenLogs,
  chessGoldenLogs,
  cricketGoldenLogs,
  footballGoldenLogs,
  hockeyGoldenLogs,
  kabaddiGoldenLogs,
  khoKhoGoldenLogs,
  runBasketballGoldenLog,
  runChessGoldenLog,
  runCricketGoldenLog,
  runFootballGoldenLog,
  runHockeyGoldenLog,
  runKabaddiGoldenLog,
  runKhoKhoGoldenLog,
  runGoldenLog,
  runTennisGoldenLog,
  runVolleyballGoldenLog,
  runWrestlingGoldenLog,
  tennisGoldenLogs,
  volleyballGoldenLogs,
  wrestlingGoldenLogs,
} from '@scoresphere/sports/golden';
import { describe, expect, it } from 'vitest';

/** The client build of every engine must reproduce every golden log (plan D19). */
const suites = [
  { sport: 'badminton', logs: badmintonGoldenLogs, run: runGoldenLog, engine: badmintonEngine },
  { sport: 'cricket', logs: cricketGoldenLogs, run: runCricketGoldenLog, engine: cricketEngine },
  { sport: 'tennis', logs: tennisGoldenLogs, run: runTennisGoldenLog, engine: tennisEngine },
  {
    sport: 'volleyball',
    logs: volleyballGoldenLogs,
    run: runVolleyballGoldenLog,
    engine: volleyballEngine,
  },
  { sport: 'chess', logs: chessGoldenLogs, run: runChessGoldenLog, engine: chessEngine },
  {
    sport: 'football',
    logs: footballGoldenLogs,
    run: runFootballGoldenLog,
    engine: footballEngine,
  },
  {
    sport: 'field-hockey',
    logs: hockeyGoldenLogs,
    run: runHockeyGoldenLog,
    engine: hockeyEngine,
  },
  {
    sport: 'basketball',
    logs: basketballGoldenLogs,
    run: runBasketballGoldenLog,
    engine: basketballEngine,
  },
  { sport: 'kabaddi', logs: kabaddiGoldenLogs, run: runKabaddiGoldenLog, engine: kabaddiEngine },
  { sport: 'kho-kho', logs: khoKhoGoldenLogs, run: runKhoKhoGoldenLog, engine: khoKhoEngine },
  {
    sport: 'wrestling',
    logs: wrestlingGoldenLogs,
    run: runWrestlingGoldenLog,
    engine: wrestlingEngine,
  },
] as const;

for (const suite of suites) {
  describe(`client build: ${suite.sport}`, () => {
    for (const log of suite.logs) {
      it(log.name, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { projection } = (suite.run as (l: any) => { projection: { state: unknown } })(log);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((suite.engine as any).result(projection.state).summary).toBe(log.expected.summary);
      });
    }
  });
}
