import type { Preset } from '@scoresphere/engine-kit';
import { z } from 'zod';

const MINUTE = 60_000;

/** One time control per player (FIDE Laws of Chess, Article 6 and Appendices A–B). */
export const timeControlSchema = z.object({
  baseMs: z
    .int()
    .min(10_000)
    .max(4 * 60 * MINUTE),
  /** Added after each of the player's moves (Fischer increment). */
  incrementMs: z
    .int()
    .min(0)
    .max(5 * MINUTE),
  /** Each move's first `delayMs` is free: simple (US) delay, or Bronstein, which gives the same times. */
  delayMs: z
    .int()
    .min(0)
    .max(5 * MINUTE),
  /** Time added after a set number of a player's moves, e.g. 30 minutes after move 40. */
  stages: z
    .array(
      z.object({
        afterMoves: z.int().min(1).max(200),
        addMs: z
          .int()
          .min(0)
          .max(4 * 60 * MINUTE),
      }),
    )
    .max(3),
});
export type TimeControl = z.infer<typeof timeControlSchema>;

/** Chess settings. Without a time control the app records the result only. */
export const chessSettingsSchema = z.object({ timeControl: timeControlSchema.nullable() });
export type ChessSettings = z.infer<typeof chessSettingsSchema>;

const preset = (
  key: string,
  name: string,
  category: Preset<ChessSettings>['category'],
  timeControl: TimeControl | null,
): Preset<ChessSettings> => ({ key, version: 1, name, category, config: { timeControl } });

const tc = (baseMin: number, incSec: number, stages: TimeControl['stages'] = []): TimeControl => ({
  baseMs: baseMin * MINUTE,
  incrementMs: incSec * 1000,
  delayMs: 0,
  stages,
});

export const chessPresets: readonly Preset<ChessSettings>[] = [
  preset('classical-90-30', 'Classical: 90 min + 30 s a move', 'official', tc(90, 30)),
  preset(
    'classical-90-40-30',
    'Classical: 90 min for 40 moves, then 30 min, + 30 s a move',
    'official',
    tc(90, 30, [{ afterMoves: 40, addMs: 30 * MINUTE }]),
  ),
  preset('rapid-15-10', 'Rapid: 15 min + 10 s a move', 'official', tc(15, 10)),
  preset('blitz-3-2', 'Blitz: 3 min + 2 s a move', 'official', tc(3, 2)),
  preset('bullet-1-0', 'Bullet: 1 min', 'casual', tc(1, 0)),
  preset('no-clock', 'No clock (result only)', 'casual', null),
];
