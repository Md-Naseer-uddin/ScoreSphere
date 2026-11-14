import type { SportKey } from '@scoresphere/contracts';
import { badmintonRules } from './badminton/content.js';
import { chessRules } from './chess/content.js';
import type { RulesContent } from './content.js';
import { cricketRules } from './cricket/content.js';
import { hockeyRules } from './field-hockey/content.js';
import { footballRules } from './football/content.js';
import { tennisRules } from './tennis/content.js';
import { volleyballRules } from './volleyball/content.js';

const RULES_CONTENT: Partial<Record<SportKey, RulesContent>> = {
  badminton: badmintonRules,
  chess: chessRules,
  cricket: cricketRules,
  football: footballRules,
  'field-hockey': hockeyRules,
  tennis: tennisRules,
  volleyball: volleyballRules,
};

/** In-app rules help for a sport, when it has been written (spec sports §7). */
export function rulesContent(sport: SportKey): RulesContent | undefined {
  return RULES_CONTENT[sport];
}
