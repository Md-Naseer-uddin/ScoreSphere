import type { SportKey } from '@scoresphere/contracts';
import { badmintonRules } from './badminton/content.js';
import { basketballRules } from './basketball/content.js';
import { carromRules } from './carrom/content.js';
import { chessRules } from './chess/content.js';
import type { RulesContent } from './content.js';
import { cricketRules } from './cricket/content.js';
import { hockeyRules } from './field-hockey/content.js';
import { footballRules } from './football/content.js';
import { kabaddiRules } from './kabaddi/content.js';
import { khoKhoRules } from './kho-kho/content.js';
import { tennisRules } from './tennis/content.js';
import { volleyballRules } from './volleyball/content.js';
import { wrestlingRules } from './wrestling/content.js';

const RULES_CONTENT: Partial<Record<SportKey, RulesContent>> = {
  badminton: badmintonRules,
  basketball: basketballRules,
  carrom: carromRules,
  chess: chessRules,
  cricket: cricketRules,
  football: footballRules,
  'field-hockey': hockeyRules,
  kabaddi: kabaddiRules,
  'kho-kho': khoKhoRules,
  tennis: tennisRules,
  volleyball: volleyballRules,
  wrestling: wrestlingRules,
};

/** In-app rules help for a sport, when it has been written (spec sports §7). */
export function rulesContent(sport: SportKey): RulesContent | undefined {
  return RULES_CONTENT[sport];
}
