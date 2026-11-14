import type { SportKey } from '@scoresphere/contracts';
import { badmintonUi } from './badminton';
import { chessUi } from './chess';
import { cricketUi } from './cricket';
import { hockeyUi } from './field-hockey';
import { footballUi } from './football';
import { tennisUi } from './tennis';
import type { SportUi } from './types';
import { volleyballUi } from './volleyball';

/** Sports with a scoring screen. Others show as coming soon until their milestone. */
const registry: Partial<Record<SportKey, SportUi>> = {
  badminton: badmintonUi,
  chess: chessUi,
  cricket: cricketUi,
  'field-hockey': hockeyUi,
  football: footballUi,
  tennis: tennisUi,
  volleyball: volleyballUi,
};

export function sportUi(sport: SportKey): SportUi | undefined {
  return registry[sport];
}
