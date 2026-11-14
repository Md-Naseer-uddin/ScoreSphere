import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/**
 * Kabaddi settings. The classic game and the newer rules (raid timer, do-or-die raids,
 * super tackles) are settings, so a local organiser can play either.
 */
export const kabaddiSettingsSchema = z.object({
  playersOnMat: z.int().min(4).max(7),
  halves: z.int().min(1).max(2),
  halfMinutes: z.int().min(3).max(30),
  /** Seconds a raid may last; null for no raid timer. Shown as a timer on the scoring device. */
  raidSeconds: z.int().min(10).max(60).nullable(),
  /** Bonus points for crossing the bonus line. */
  bonusLine: z.boolean(),
  /** The bonus line counts only while the defence has at least this many players. */
  bonusMinDefenders: z.int().min(1).max(7),
  /** A tackle by this many defenders or fewer scores 2 (super tackle); null for none. */
  superTackleMaxDefenders: z.int().min(1).max(6).nullable(),
  /** After two empty raids in a row, a team's next raid must score. */
  doOrDie: z.boolean(),
  /** Extra points for putting the whole opposing team out (all out, "lona"). */
  allOutPoints: z.int().min(0).max(5),
  timeoutsPerHalf: z.int().min(0).max(5),
});
export type KabaddiSettings = z.infer<typeof kabaddiSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<KabaddiSettings>['category'],
  config: KabaddiSettings,
): Preset<KabaddiSettings> => ({ key, version: 1, name, category, config });

const modern: KabaddiSettings = {
  playersOnMat: 7,
  halves: 2,
  halfMinutes: 20,
  raidSeconds: 30,
  bonusLine: true,
  bonusMinDefenders: 6,
  superTackleMaxDefenders: 3,
  doOrDie: true,
  allOutPoints: 2,
  timeoutsPerHalf: 2,
};

/** Categories are casual until the owner confirms which match the current federation rules. */
export const kabaddiPresets: readonly Preset<KabaddiSettings>[] = [
  preset('modern-2x20', '2 × 20 minutes, 30-second raids, do-or-die raids', 'casual', modern),
  preset('classic-2x20', 'Classic 2 × 20 minutes (no raid timer or do-or-die)', 'casual', {
    ...modern,
    raidSeconds: null,
    superTackleMaxDefenders: null,
    doOrDie: false,
  }),
  preset('juniors-2x15', 'Juniors and women, 2 × 15 minutes', 'casual', {
    ...modern,
    halfMinutes: 15,
  }),
  preset('school-2x10', 'School game, 2 × 10 minutes', 'local', {
    ...modern,
    halfMinutes: 10,
    timeoutsPerHalf: 1,
  }),
];
