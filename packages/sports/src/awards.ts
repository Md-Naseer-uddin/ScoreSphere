import type { SportKey } from '@scoresphere/contracts';
import type { MatchAwardDefinition } from '@scoresphere/engine-kit';
import { badmintonMatchAwards } from './badminton/awards.js';
import { basketballMatchAwards } from './basketball/awards.js';
import { cricketMatchAwards } from './cricket/awards.js';
import { hockeyMatchAwards } from './field-hockey/awards.js';
import { footballMatchAwards } from './football/awards.js';
import { kabaddiMatchAwards } from './kabaddi/awards.js';
import { khoKhoMatchAwards } from './kho-kho/awards.js';
import { tennisPlayerOfTheMatch } from './tennis/awards.js';
import { volleyballMatchAwards } from './volleyball/awards.js';

// Award definitions are typed by each sport's state; the registry erases that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAward = MatchAwardDefinition<any>;

const byEngine: Partial<Record<SportKey, Record<number, readonly AnyAward[]>>> = {
  badminton: { 1: badmintonMatchAwards },
  basketball: { 1: basketballMatchAwards },
  cricket: { 1: cricketMatchAwards },
  football: { 1: footballMatchAwards },
  'field-hockey': { 1: hockeyMatchAwards },
  kabaddi: { 1: kabaddiMatchAwards },
  'kho-kho': { 1: khoKhoMatchAwards },
  tennis: { 1: [tennisPlayerOfTheMatch] },
  volleyball: { 1: volleyballMatchAwards },
  // Chess records a result only; there is no match award (spec scoring §5).
  chess: { 1: [] },
};

/** The match awards for a sport's engine version (awards are versioned with the engine). */
export function matchAwardDefinitions(sport: SportKey, engineVersion: number): readonly AnyAward[] {
  return byEngine[sport]?.[engineVersion] ?? [];
}
