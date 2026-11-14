import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Field hockey settings (FIH Rules of Hockey), with casual variants. */
export const hockeySettingsSchema = z.object({
  playersOnField: z.int().min(4).max(11),
  /** Four quarters in the Rules; casual matches often play two halves. */
  periods: z.int().min(1).max(4),
  periodMinutes: z.int().min(1).max(35),
  /** A shoot-out when the score is level at the end; null leaves a draw. */
  shootout: z.object({ attempts: z.int().min(1).max(10) }).nullable(),
  /** Suspension lengths in minutes of playing time. */
  greenCardMinutes: z.int().min(1).max(10),
  yellowCardMinutes: z.int().min(1).max(20),
  /** Stop the clock after a goal and while a penalty corner is set up, as in FIH events. */
  stopClock: z.boolean(),
});
export type HockeySettings = z.infer<typeof hockeySettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<HockeySettings>['category'],
  config: HockeySettings,
): Preset<HockeySettings> => ({ key, version: 1, name, category, config });

const fih: HockeySettings = {
  playersOnField: 11,
  periods: 4,
  periodMinutes: 15,
  shootout: null,
  greenCardMinutes: 2,
  yellowCardMinutes: 5,
  stopClock: true,
};

export const hockeyPresets: readonly Preset<HockeySettings>[] = [
  preset('fih-4x15', '4 × 15 minutes (FIH)', 'official', fih),
  preset('fih-shootout', '4 × 15 minutes, shoot-out if level', 'official', {
    ...fih,
    shootout: { attempts: 5 },
  }),
  preset('school-2x25', 'School match, 2 × 25 minutes, running clock', 'casual', {
    ...fih,
    periods: 2,
    periodMinutes: 25,
    stopClock: false,
  }),
  preset('six-a-side', '6-a-side, 2 × 15 minutes, running clock', 'casual', {
    ...fih,
    playersOnField: 6,
    periods: 2,
    periodMinutes: 15,
    stopClock: false,
  }),
];
