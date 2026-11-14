import { z } from 'zod';
import { awardProvenanceSchema, awardStatusSchema } from './awards.js';
import { idSchema } from './ids.js';
import { sportKeySchema } from './sports.js';

/** Tournaments (plan M7, ADR 0023). v1 tournaments are single-workspace. */
export const TOURNAMENT_FORMATS = ['round_robin', 'single_elimination'] as const;
export const tournamentFormatSchema = z.enum(TOURNAMENT_FORMATS);
export type TournamentFormat = z.infer<typeof tournamentFormatSchema>;

export const tournamentStatusSchema = z.enum(['draft', 'active', 'completed']);

const pointsSchema = z.object({
  win: z.number().min(0).max(10),
  draw: z.number().min(0).max(10),
  loss: z.number().min(0).max(10),
});

export const createTournamentRequestSchema = z.object({
  name: z.string().trim().min(1, 'REQUIRED').max(120, 'TOO_LONG'),
  sport: sportKeySchema,
  format: tournamentFormatSchema,
  presetKey: z.string().min(1).max(60),
  presetVersion: z.int().min(1),
  /** Resolved match settings every fixture uses. */
  config: z.record(z.string(), z.unknown()),
  /** League points; the sport's defaults when omitted. */
  points: pointsSchema.optional(),
  /** Tie-break order from the sport's allowed list; the sport's default when omitted. */
  tieBreaks: z.array(z.string().max(40)).max(6).optional(),
});
export type CreateTournamentRequest = z.infer<typeof createTournamentRequestSchema>;

export const tournamentSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  sport: sportKeySchema,
  format: tournamentFormatSchema,
  engineVersion: z.int(),
  presetKey: z.string(),
  presetVersion: z.int(),
  config: z.record(z.string(), z.unknown()),
  points: pointsSchema,
  tieBreaks: z.array(z.string()),
  status: tournamentStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Tournament = z.infer<typeof tournamentSchema>;

/** An entry is a team or, in individual sports, a roster member (ADR 0023). */
export const addTournamentEntriesRequestSchema = z.object({
  entries: z
    .array(
      z
        .object({ teamId: idSchema.optional(), rosterMemberId: idSchema.optional() })
        .refine((e) => Boolean(e.teamId) !== Boolean(e.rosterMemberId), 'TEAM_OR_ROSTER_MEMBER'),
    )
    .min(1)
    .max(64),
});
export type AddTournamentEntriesRequest = z.infer<typeof addTournamentEntriesRequestSchema>;

export const tournamentEntrySchema = z.object({
  id: idSchema,
  teamId: idSchema.nullable(),
  rosterMemberId: idSchema.nullable(),
  displayName: z.string(),
  /** 1 is the top seed; entries are seeded in the order they were added. */
  seed: z.int(),
});
export type TournamentEntry = z.infer<typeof tournamentEntrySchema>;

export const fixtureStatusSchema = z.enum(['waiting', 'ready', 'live', 'completed', 'bye']);

export const tournamentFixtureSchema = z.object({
  id: idSchema,
  round: z.int(),
  position: z.int(),
  side1EntryId: idSchema.nullable(),
  side2EntryId: idSchema.nullable(),
  bye: z.boolean(),
  matchId: idSchema.nullable(),
  winnerEntryId: idSchema.nullable(),
  /** `waiting` until both sides are known; `ready` to be scored. */
  status: fixtureStatusSchema,
  resultSummary: z.string().nullable(),
  /** Level after the match (a tie in a knockout): an organizer decides who advances. */
  needsDecision: z.boolean(),
});
export type TournamentFixture = z.infer<typeof tournamentFixtureSchema>;

export const tournamentDetailSchema = tournamentSchema.extend({
  entries: z.array(tournamentEntrySchema),
  fixtures: z.array(tournamentFixtureSchema),
});
export type TournamentDetail = z.infer<typeof tournamentDetailSchema>;

export const standingsRowSchema = z.object({
  entryId: idSchema,
  displayName: z.string(),
  rank: z.int(),
  played: z.int(),
  won: z.int(),
  drawn: z.int(),
  lost: z.int(),
  points: z.number(),
  tieBreaks: z.record(z.string(), z.number()),
});
export type StandingsRowDto = z.infer<typeof standingsRowSchema>;

export const leaderboardSchema = z.object({
  metric: z.string(),
  label: z.string(),
  rows: z.array(z.object({ rosterMemberId: idSchema, displayName: z.string(), value: z.number() })),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

export const tournamentAwardSchema = z.object({
  awardKey: z.string(),
  name: z.string(),
  criteria: z.string(),
  status: awardStatusSchema,
  provenance: awardProvenanceSchema,
  recipients: z.array(
    z.object({
      kind: z.enum(['entry', 'roster_member']),
      id: idSchema,
      displayName: z.string(),
    }),
  ),
  metrics: z.record(z.string(), z.number()),
  publishedAt: z.iso.datetime(),
});
export type TournamentAward = z.infer<typeof tournamentAwardSchema>;

export const decideFixtureRequestSchema = z.object({ winnerEntryId: idSchema });
