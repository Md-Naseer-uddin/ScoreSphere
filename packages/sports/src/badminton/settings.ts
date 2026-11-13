import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/**
 * Badminton match settings. Everything a local variant might change is a setting, so no
 * scoring rule is hidden in engine code (plan D16a).
 */
export const badmintonSettingsSchema = z
  .object({
    discipline: z.enum(['singles', 'doubles']),
    /** Points that win a game, given the lead in `winBy`. */
    pointsToWin: z.int().min(1).max(99),
    /** Lead needed to win a game. 1 means the first side to `pointsToWin` wins. */
    winBy: z.int().min(1).max(5),
    /** Score at which the next point wins regardless of lead; null for no cap. */
    cap: z.int().min(1).max(199).nullable(),
    /** Games needed to win the match: 1 = one game, 2 = best of three, 3 = best of five. */
    gamesToWin: z.int().min(1).max(3),
    /** Leading score that triggers the in-game interval prompt; null for none. */
    intervalAt: z.int().min(1).max(99).nullable(),
    /** Score at which sides change ends in the deciding game; null for no prompt. */
    deciderChangeEndsAt: z.int().min(1).max(99).nullable(),
  })
  .refine((s) => s.cap === null || s.cap >= s.pointsToWin, {
    message: 'CAP_BELOW_TARGET',
    path: ['cap'],
  });
export type BadmintonSettings = z.infer<typeof badmintonSettingsSchema>;

/** Scoring rules only; the match wizard picks singles or doubles. */
export type BadmintonScoring = Omit<BadmintonSettings, 'discipline'>;

const preset = (
  key: string,
  name: string,
  category: Preset<BadmintonScoring>['category'],
  config: BadmintonScoring,
): Preset<BadmintonScoring> => ({ key, version: 1, name, category, config });

/**
 * BWF's Laws use 3×21 until 3 January 2027 and 3×15 from 4 January 2027, with 3×21 kept
 * as an approved alternative (see `content.ts`). The 3×15 interval and change-of-ends
 * points are not confirmed yet, so that preset leaves those prompts off.
 */
export const badmintonPresets: readonly Preset<BadmintonScoring>[] = [
  preset('bwf-3x21', 'Best of 3 games to 21 (BWF)', 'official', {
    pointsToWin: 21,
    winBy: 2,
    cap: 30,
    gamesToWin: 2,
    intervalAt: 11,
    deciderChangeEndsAt: 11,
  }),
  preset('bwf-3x15', 'Best of 3 games to 15 (BWF, from 2027)', 'official', {
    pointsToWin: 15,
    winBy: 2,
    cap: 21,
    gamesToWin: 2,
    intervalAt: null,
    deciderChangeEndsAt: null,
  }),
  preset('casual-1x21', 'One game to 21', 'casual', {
    pointsToWin: 21,
    winBy: 2,
    cap: 30,
    gamesToWin: 1,
    intervalAt: 11,
    deciderChangeEndsAt: null,
  }),
  preset('casual-1x15', 'One game to 15', 'casual', {
    pointsToWin: 15,
    winBy: 2,
    cap: 21,
    gamesToWin: 1,
    intervalAt: null,
    deciderChangeEndsAt: null,
  }),
];
