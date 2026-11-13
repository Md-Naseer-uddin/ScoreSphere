import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/**
 * Cricket match settings. Limited-overs, one innings a side. Local variants are typed
 * settings with stated meanings, so no gully rule is hidden in engine code (plan D16a).
 */
export const cricketSettingsSchema = z
  .object({
    /** Most players a side may field; sides may be smaller (e.g. 5 v 6 in a gully game). */
    playersPerSide: z.int().min(2).max(15),
    oversPerInnings: z.int().min(1).max(50),
    ballsPerOver: z.int().min(4).max(8),
    /** Overs one bowler may bowl in an innings; null for no limit. */
    maxOversPerBowler: z.int().min(1).max(50).nullable(),
    /** Whether a bowler may bowl two overs in a row (not allowed under the Laws). */
    allowConsecutiveOvers: z.boolean(),
    /** Penalty runs for a wide and for a no-ball. Both are re-bowled. */
    wideRuns: z.int().min(0).max(5),
    noBallRuns: z.int().min(0).max(5),
    /** The delivery after a no-ball is a free hit (only run-out and similar dismissals). */
    freeHit: z.boolean(),
    /** The last batter may bat on alone; the innings ends when every batter is out. */
    lastManStands: z.boolean(),
    /**
     * Gully rule: hitting a six over the boundary is out.
     * `out_runs_count` keeps the six; `out_no_runs` scores nothing for it.
     */
    sixAndOut: z.enum(['off', 'out_runs_count', 'out_no_runs']),
    /** Gully rule: a catch taken one-handed after one bounce is out, like a catch. */
    oneTipOneHand: z.boolean(),
    /**
     * Gully rule: after `threshold` wides in a row (by any bowler, reset by any other
     * delivery), the batting side gets `penaltyRuns` extra penalty runs.
     */
    consecutiveWides: z
      .object({ threshold: z.int().min(2).max(10), penaltyRuns: z.int().min(1).max(10) })
      .nullable(),
    /**
     * After a tie: no super over, one super over (a tie stands if it is tied too), or
     * super overs until there is a winner.
     */
    superOver: z.enum(['off', 'once', 'until_decided']),
  })
  .refine((s) => s.maxOversPerBowler === null || s.maxOversPerBowler <= s.oversPerInnings, {
    message: 'BOWLER_LIMIT_ABOVE_OVERS',
    path: ['maxOversPerBowler'],
  });
export type CricketSettings = z.infer<typeof cricketSettingsSchema>;

const lawsDefaults = {
  ballsPerOver: 6,
  allowConsecutiveOvers: false,
  wideRuns: 1,
  noBallRuns: 1,
  freeHit: true,
  lastManStands: false,
  sixAndOut: 'off',
  oneTipOneHand: false,
  consecutiveWides: null,
  superOver: 'once',
} as const;

const preset = (
  key: string,
  name: string,
  category: Preset<CricketSettings>['category'],
  config: CricketSettings,
): Preset<CricketSettings> => ({ key, version: 1, name, category, config });

/**
 * T20 and ODI follow the ICC men's playing conditions for overs and bowler limits. T10,
 * box and gully are casual formats with common local settings, all of them editable.
 */
export const cricketPresets: readonly Preset<CricketSettings>[] = [
  preset('t20', 'T20 (20 overs)', 'official', {
    ...lawsDefaults,
    playersPerSide: 11,
    oversPerInnings: 20,
    maxOversPerBowler: 4,
  }),
  preset('odi', 'One-day (50 overs)', 'official', {
    ...lawsDefaults,
    playersPerSide: 11,
    oversPerInnings: 50,
    maxOversPerBowler: 10,
  }),
  preset('t10', 'T10 (10 overs)', 'casual', {
    ...lawsDefaults,
    playersPerSide: 11,
    oversPerInnings: 10,
    maxOversPerBowler: 2,
  }),
  preset('box', 'Box cricket (6 overs)', 'casual', {
    ...lawsDefaults,
    playersPerSide: 8,
    oversPerInnings: 6,
    maxOversPerBowler: 2,
    superOver: 'off',
  }),
  preset('gully', 'Gully cricket', 'local', {
    ...lawsDefaults,
    playersPerSide: 6,
    oversPerInnings: 5,
    maxOversPerBowler: null,
    allowConsecutiveOvers: true,
    freeHit: false,
    lastManStands: true,
    sixAndOut: 'out_no_runs',
    oneTipOneHand: true,
    consecutiveWides: { threshold: 3, penaltyRuns: 1 },
    superOver: 'off',
  }),
];
