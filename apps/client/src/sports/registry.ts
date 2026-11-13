import type { SportKey } from '@scoresphere/contracts';
import { badmintonUi } from './badminton';
import type { SportUi } from './types';

/** Sports with a scoring screen. Others show as coming soon until their milestone. */
const registry: Partial<Record<SportKey, SportUi>> = {
  badminton: badmintonUi,
};

export function sportUi(sport: SportKey): SportUi | undefined {
  return registry[sport];
}
