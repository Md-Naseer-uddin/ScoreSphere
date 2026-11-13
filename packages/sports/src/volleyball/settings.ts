import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Indoor volleyball settings (FIVB Official Volleyball Rules), with casual variants. */
export const volleyballSettingsSchema = z
  .object({
    /** Sets needed to win: 3 for best of five, 2 for best of three. */
    setsToWin: z.int().min(1).max(3),
    pointsPerSet: z.int().min(3).max(50),
    /** Points to win the deciding set. */
    decidingSetPoints: z.int().min(3).max(50),
    winBy: z.int().min(1).max(3),
    /** Score at which the next point wins a set regardless of lead; null for none. */
    cap: z.int().min(3).max(60).nullable(),
    playersOnCourt: z.int().min(2).max(6),
    /** Substitutions each team may make per set; null for no limit. */
    substitutionsPerSet: z.int().min(0).max(20).nullable(),
    timeoutsPerSet: z.int().min(0).max(5),
    /** Score at which teams change ends in the deciding set; null for no prompt. */
    deciderChangeEndsAt: z.int().min(1).max(30).nullable(),
  })
  .refine((s) => s.cap === null || s.cap >= Math.max(s.pointsPerSet, s.decidingSetPoints), {
    message: 'CAP_BELOW_TARGET',
    path: ['cap'],
  });
export type VolleyballSettings = z.infer<typeof volleyballSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<VolleyballSettings>['category'],
  config: VolleyballSettings,
): Preset<VolleyballSettings> => ({ key, version: 1, name, category, config });

export const volleyballPresets: readonly Preset<VolleyballSettings>[] = [
  preset('fivb-best-of-5', 'Best of 5 sets to 25, fifth to 15 (FIVB)', 'official', {
    setsToWin: 3,
    pointsPerSet: 25,
    decidingSetPoints: 15,
    winBy: 2,
    cap: null,
    playersOnCourt: 6,
    substitutionsPerSet: 6,
    timeoutsPerSet: 2,
    deciderChangeEndsAt: 8,
  }),
  preset('best-of-3', 'Best of 3 sets to 25, third to 15', 'casual', {
    setsToWin: 2,
    pointsPerSet: 25,
    decidingSetPoints: 15,
    winBy: 2,
    cap: null,
    playersOnCourt: 6,
    substitutionsPerSet: 6,
    timeoutsPerSet: 2,
    deciderChangeEndsAt: 8,
  }),
  preset('one-set', 'One set to 25', 'casual', {
    setsToWin: 1,
    pointsPerSet: 25,
    decidingSetPoints: 25,
    winBy: 2,
    cap: null,
    playersOnCourt: 6,
    substitutionsPerSet: null,
    timeoutsPerSet: 2,
    deciderChangeEndsAt: null,
  }),
];
