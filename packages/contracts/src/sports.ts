import { z } from 'zod';

/** Stable sport keys (ADR 0015). Display names and behaviour live in @scoresphere/sports. */
export const SPORT_KEYS = [
  'cricket',
  'badminton',
  'tennis',
  'chess',
  'kabaddi',
  'volleyball',
  'basketball',
  'wrestling',
  'football',
  'kho-kho',
  'field-hockey',
  'carrom',
] as const;
export const sportKeySchema = z.enum(SPORT_KEYS);
export type SportKey = z.infer<typeof sportKeySchema>;
