import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Association football settings (IFAB Laws of the Game), with casual small-sided variants. */
export const footballSettingsSchema = z.object({
  playersOnField: z.int().min(3).max(11),
  /** Periods of regular time: 2 halves in the Laws. */
  periods: z.int().min(1).max(4),
  periodMinutes: z.int().min(1).max(60),
  /** Played when the score is level after regular time; null for none (leagues). */
  extraTime: z
    .object({ periods: z.int().min(1).max(2), periodMinutes: z.int().min(1).max(30) })
    .nullable(),
  /** Kicks from the penalty mark when still level (Law 10); null to leave a draw. */
  shootout: z.object({ kicks: z.int().min(1).max(10) }).nullable(),
  /** Substitutions each team may make; null for no limit. */
  maxSubstitutions: z.int().min(0).max(20).nullable(),
  /** Substituted players may come back on, as in much casual football. */
  rollingSubstitutions: z.boolean(),
});
export type FootballSettings = z.infer<typeof footballSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<FootballSettings>['category'],
  config: FootballSettings,
): Preset<FootballSettings> => ({ key, version: 1, name, category, config });

const laws: FootballSettings = {
  playersOnField: 11,
  periods: 2,
  periodMinutes: 45,
  extraTime: null,
  shootout: null,
  maxSubstitutions: 5,
  rollingSubstitutions: false,
};

export const footballPresets: readonly Preset<FootballSettings>[] = [
  preset('ifab-90', '90 minutes (Laws of the Game)', 'official', laws),
  preset('ifab-knockout', '90 minutes, then extra time and penalties', 'official', {
    ...laws,
    extraTime: { periods: 2, periodMinutes: 15 },
    shootout: { kicks: 5 },
  }),
  preset('school-60', 'School match, 2 × 30 minutes', 'casual', {
    ...laws,
    periodMinutes: 30,
    maxSubstitutions: null,
  }),
  preset('seven-a-side', '7-a-side, 2 × 25 minutes, rolling substitutes', 'casual', {
    ...laws,
    playersOnField: 7,
    periodMinutes: 25,
    maxSubstitutions: null,
    rollingSubstitutions: true,
  }),
  preset('five-a-side', '5-a-side, 2 × 20 minutes, rolling substitutes', 'casual', {
    ...laws,
    playersOnField: 5,
    periodMinutes: 20,
    maxSubstitutions: null,
    rollingSubstitutions: true,
  }),
  preset('local-knockout', 'Local knockout: 2 × 20 minutes, penalties if level', 'local', {
    ...laws,
    playersOnField: 7,
    periodMinutes: 20,
    shootout: { kicks: 5 },
    maxSubstitutions: null,
    rollingSubstitutions: true,
  }),
];
