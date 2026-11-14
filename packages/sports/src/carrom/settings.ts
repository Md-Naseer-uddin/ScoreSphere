import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

/** Carrom settings (ICF Laws of Carrom), with casual variants. */
export const carromSettingsSchema = z.object({
  discipline: z.enum(['singles', 'doubles']),
  /** Points that win a game. */
  targetPoints: z.int().min(5).max(50),
  /** After this many boards the leader wins the game (extra boards while level); null for none. */
  maxBoards: z.int().min(1).max(20).nullable(),
  queenPoints: z.int().min(0).max(10),
  /** The queen counts only while the board winner's game score is below this; null for always. */
  queenCountsBelow: z.int().min(1).max(50).nullable(),
  gamesToWin: z.int().min(1).max(3),
});
export type CarromSettings = z.infer<typeof carromSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<CarromSettings>['category'],
  config: CarromSettings,
): Preset<CarromSettings> => ({ key, version: 1, name, category, config });

const icf: CarromSettings = {
  discipline: 'singles',
  targetPoints: 25,
  maxBoards: 8,
  queenPoints: 3,
  queenCountsBelow: 22,
  gamesToWin: 2,
};

export const carromPresets: readonly Preset<CarromSettings>[] = [
  preset('icf-best-of-3', 'Best of 3 games to 25 (ICF)', 'official', icf),
  preset('one-game-25', 'One game to 25 or 8 boards', 'casual', { ...icf, gamesToWin: 1 }),
  preset('family-29', 'Family game to 29, queen worth 5', 'local', {
    ...icf,
    targetPoints: 29,
    maxBoards: null,
    queenPoints: 5,
    queenCountsBelow: null,
    gamesToWin: 1,
  }),
];
