import type { SportKey } from '@scoresphere/contracts';
import { badmintonUi } from './badminton';
import { cricketUi } from './cricket';
import type { SportUi } from './types';

/** Sports with a scoring screen. Others show as coming soon until their milestone. */
const registry: Partial<Record<SportKey, SportUi>> = {
  badminton: badmintonUi,
  cricket: cricketUi,
};

export function sportUi(sport: SportKey): SportUi | undefined {
  return registry[sport];
}
