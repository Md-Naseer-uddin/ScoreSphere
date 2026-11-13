import type { SportKey } from '@scoresphere/contracts';

/** Helper families share building blocks only; every sport still has its own engine (plan §3.3). */
export type SportFamily =
  'bat-and-ball' | 'rally' | 'board' | 'timed-team' | 'raid-chase' | 'combat' | 'cue';

export interface SportDefinition {
  key: SportKey;
  name: string;
  family: SportFamily;
  /** Whether matches are between individuals, teams, or either (doubles, pairs). */
  participation: 'individual' | 'team' | 'either';
  /** Whether scoring needs a running clock. */
  usesClock: boolean;
}

/** Typed as a Record so adding a key to SPORT_KEYS without a definition fails to compile. */
const definitions: Record<SportKey, Omit<SportDefinition, 'key'>> = {
  cricket: { name: 'Cricket', family: 'bat-and-ball', participation: 'team', usesClock: false },
  badminton: { name: 'Badminton', family: 'rally', participation: 'either', usesClock: false },
  tennis: { name: 'Tennis', family: 'rally', participation: 'either', usesClock: false },
  chess: { name: 'Chess', family: 'board', participation: 'individual', usesClock: true },
  kabaddi: { name: 'Kabaddi', family: 'raid-chase', participation: 'team', usesClock: true },
  volleyball: { name: 'Volleyball', family: 'rally', participation: 'team', usesClock: false },
  basketball: { name: 'Basketball', family: 'timed-team', participation: 'team', usesClock: true },
  wrestling: { name: 'Wrestling', family: 'combat', participation: 'individual', usesClock: true },
  football: { name: 'Football', family: 'timed-team', participation: 'team', usesClock: true },
  'kho-kho': { name: 'Kho-Kho', family: 'raid-chase', participation: 'team', usesClock: true },
  'field-hockey': { name: 'Hockey', family: 'timed-team', participation: 'team', usesClock: true },
  carrom: { name: 'Carrom', family: 'cue', participation: 'either', usesClock: false },
};

export const SPORTS: readonly SportDefinition[] = Object.entries(definitions).map(([key, def]) => ({
  key: key as SportKey,
  ...def,
}));

export function getSport(key: SportKey): SportDefinition {
  return { key, ...definitions[key] };
}
