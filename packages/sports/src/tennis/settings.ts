import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

const tiebreak = z.object({ type: z.literal('tiebreak'), points: z.int().min(3).max(15) });
const advantage = z.object({ type: z.literal('advantage') });
/** The deciding set is replaced by one tie-break game (ITF Rules, Appendix V). */
const matchTiebreak = z.object({
  type: z.literal('match_tiebreak'),
  points: z.int().min(5).max(15),
});

/** Tennis match settings; every scoring method the ITF Rules allow is a setting. */
export const tennisSettingsSchema = z.object({
  discipline: z.enum(['singles', 'doubles']),
  /** Sets needed to win: 1, 2 (best of three) or 3 (best of five). */
  setsToWin: z.int().min(1).max(3),
  /** Games that win a set, given a two-game lead. */
  gamesPerSet: z.int().min(2).max(10),
  /** How sets other than the deciding one end when level at `gamesPerSet`. */
  set: z.discriminatedUnion('type', [tiebreak, advantage]),
  /** How the deciding set ends. */
  finalSet: z.discriminatedUnion('type', [tiebreak, advantage, matchTiebreak]),
  /** No-ad scoring: at deuce, the next point wins the game. */
  noAd: z.boolean(),
});
export type TennisSettings = z.infer<typeof tennisSettingsSchema>;
export type TennisScoring = Omit<TennisSettings, 'discipline'>;

const preset = (
  key: string,
  name: string,
  category: Preset<TennisScoring>['category'],
  config: TennisScoring,
): Preset<TennisScoring> => ({ key, version: 1, name, category, config });

export const tennisPresets: readonly Preset<TennisScoring>[] = [
  preset('itf-best-of-3', 'Best of 3 tie-break sets (ITF)', 'official', {
    setsToWin: 2,
    gamesPerSet: 6,
    set: { type: 'tiebreak', points: 7 },
    finalSet: { type: 'tiebreak', points: 7 },
    noAd: false,
  }),
  preset(
    'itf-match-tiebreak',
    'Best of 3, match tie-break instead of a third set (ITF)',
    'official',
    {
      setsToWin: 2,
      gamesPerSet: 6,
      set: { type: 'tiebreak', points: 7 },
      finalSet: { type: 'match_tiebreak', points: 10 },
      noAd: false,
    },
  ),
  preset('itf-best-of-5', 'Best of 5, 10-point tie-break at 6–6 in the fifth (ITF)', 'official', {
    setsToWin: 3,
    gamesPerSet: 6,
    set: { type: 'tiebreak', points: 7 },
    finalSet: { type: 'tiebreak', points: 10 },
    noAd: false,
  }),
  preset('short-sets', 'Short sets to 4, no-ad', 'casual', {
    setsToWin: 2,
    gamesPerSet: 4,
    set: { type: 'tiebreak', points: 7 },
    finalSet: { type: 'match_tiebreak', points: 10 },
    noAd: true,
  }),
  preset('pro-set', 'One pro set to 8 games', 'casual', {
    setsToWin: 1,
    gamesPerSet: 8,
    set: { type: 'tiebreak', points: 7 },
    finalSet: { type: 'tiebreak', points: 7 },
    noAd: false,
  }),
];
