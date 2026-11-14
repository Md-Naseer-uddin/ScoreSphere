import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

export const WRESTLING_STYLES = ['freestyle', 'greco_roman', 'womens'] as const;

/** Wrestling settings (UWW International Wrestling Rules). Weight category is shown, not scored. */
export const wrestlingSettingsSchema = z.object({
  style: z.enum(WRESTLING_STYLES),
  weightClass: z.string().trim().max(20).nullable(),
  periods: z.int().min(1).max(3),
  periodMinutes: z.int().min(1).max(5),
  /** A lead of this many points ends the bout (technical superiority); null for none. */
  technicalSuperiority: z.int().min(1).max(20).nullable(),
  /** Cautions that disqualify a wrestler. */
  cautionsToDisqualify: z.int().min(1).max(5),
});
export type WrestlingSettings = z.infer<typeof wrestlingSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<WrestlingSettings>['category'],
  config: WrestlingSettings,
): Preset<WrestlingSettings> => ({ key, version: 1, name, category, config });

const senior: WrestlingSettings = {
  style: 'freestyle',
  weightClass: null,
  periods: 2,
  periodMinutes: 3,
  technicalSuperiority: 10,
  cautionsToDisqualify: 3,
};

export const wrestlingPresets: readonly Preset<WrestlingSettings>[] = [
  preset('uww-freestyle', 'Freestyle, 2 × 3 minutes (UWW)', 'official', senior),
  preset('uww-womens', 'Women’s wrestling, 2 × 3 minutes (UWW)', 'official', {
    ...senior,
    style: 'womens',
  }),
  preset('uww-greco', 'Greco-Roman, 2 × 3 minutes (UWW)', 'official', {
    ...senior,
    style: 'greco_roman',
    technicalSuperiority: 8,
  }),
  preset('juniors-2x2', 'Young wrestlers, 2 × 2 minutes', 'casual', {
    ...senior,
    periodMinutes: 2,
  }),
];
