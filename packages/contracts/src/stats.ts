import { z } from 'zod';
import { idSchema } from './ids.js';
import { sportKeySchema } from './sports.js';

/** One sport's record and summed statistics (plan M7 player and team pages). */
export const sportRecordSchema = z.object({
  sport: sportKeySchema,
  played: z.int(),
  won: z.int(),
  drawn: z.int(),
  lost: z.int(),
  /** Summed engine metrics, e.g. `runs`, `wickets`, `points_won`. */
  metrics: z.record(z.string(), z.number()),
});
export type SportRecord = z.infer<typeof sportRecordSchema>;

export const statsQuerySchema = z.object({
  tournamentId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const recentMatchSchema = z.object({
  matchId: idSchema,
  sport: sportKeySchema,
  title: z.string(),
  result: z.enum(['won', 'drawn', 'lost']),
  summary: z.string(),
  endedAt: z.iso.datetime().nullable(),
});

export const playerStatsSchema = z.object({
  displayName: z.string(),
  sports: z.array(sportRecordSchema),
  recent: z.array(recentMatchSchema),
});
export type PlayerStats = z.infer<typeof playerStatsSchema>;
