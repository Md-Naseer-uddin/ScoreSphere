import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Basketball settings (FIBA Official Basketball Rules), with casual variants. */
export const basketballSettingsSchema = z.object({
  playersOnCourt: z.int().min(3).max(5),
  periods: z.int().min(1).max(4),
  periodMinutes: z.int().min(1).max(20),
  /** Played, as often as needed, while the score is level (no drawn games). */
  overtimeMinutes: z.int().min(1).max(10),
  /** Fouls that put a player out of the game (FIBA 5); null for no limit. */
  foulLimit: z.int().min(1).max(10).nullable(),
  /** Team fouls in a quarter after which every further foul brings the penalty (FIBA 4). */
  teamFoulLimit: z.int().min(1).max(10).nullable(),
  timeoutsFirstHalf: z.int().min(0).max(5),
  timeoutsSecondHalf: z.int().min(0).max(5),
  timeoutsPerOvertime: z.int().min(0).max(3),
});
export type BasketballSettings = z.infer<typeof basketballSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<BasketballSettings>['category'],
  config: BasketballSettings,
): Preset<BasketballSettings> => ({ key, version: 1, name, category, config });

const fiba: BasketballSettings = {
  playersOnCourt: 5,
  periods: 4,
  periodMinutes: 10,
  overtimeMinutes: 5,
  foulLimit: 5,
  teamFoulLimit: 4,
  timeoutsFirstHalf: 2,
  timeoutsSecondHalf: 3,
  timeoutsPerOvertime: 1,
};

export const basketballPresets: readonly Preset<BasketballSettings>[] = [
  preset('fiba-4x10', '4 × 10 minutes (FIBA)', 'official', fiba),
  preset('school-4x8', 'School game, 4 × 8 minutes', 'casual', { ...fiba, periodMinutes: 8 }),
  preset('halves-2x20', 'Two halves of 20 minutes', 'casual', {
    ...fiba,
    periods: 2,
    periodMinutes: 20,
    teamFoulLimit: 7,
  }),
  preset('pickup-3v3', '3 v 3 pickup, 1 × 15 minutes', 'casual', {
    ...fiba,
    playersOnCourt: 3,
    periods: 1,
    periodMinutes: 15,
    foulLimit: null,
    teamFoulLimit: null,
    timeoutsFirstHalf: 1,
    timeoutsSecondHalf: 0,
  }),
];
