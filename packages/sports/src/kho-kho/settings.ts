import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Kho-kho settings. Turn length and points vary between formats, so they are settings. */
export const khoKhoSettingsSchema = z.object({
  /** Each innings is one chasing turn for each team. */
  innings: z.int().min(1).max(2),
  turnMinutes: z.int().min(1).max(15),
  /** Defenders enter in batches of this size. */
  batchSize: z.int().min(1).max(4),
  /** Points to the chasing team for each defender put out. */
  pointsPerOut: z.int().min(1).max(3),
});
export type KhoKhoSettings = z.infer<typeof khoKhoSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<KhoKhoSettings>['category'],
  config: KhoKhoSettings,
): Preset<KhoKhoSettings> => ({ key, version: 1, name, category, config });

/** Categories are casual until the owner confirms which match the current federation rules. */
export const khoKhoPresets: readonly Preset<KhoKhoSettings>[] = [
  preset('two-innings-7', 'Two innings, 7-minute turns', 'casual', {
    innings: 2,
    turnMinutes: 7,
    batchSize: 3,
    pointsPerOut: 1,
  }),
  preset('two-innings-9', 'Two innings, 9-minute turns', 'casual', {
    innings: 2,
    turnMinutes: 9,
    batchSize: 3,
    pointsPerOut: 1,
  }),
  preset('school-5', 'School game: one innings, 5-minute turns', 'local', {
    innings: 1,
    turnMinutes: 5,
    batchSize: 3,
    pointsPerOut: 1,
  }),
];
