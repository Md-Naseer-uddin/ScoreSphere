import { z } from 'zod';
import { idSchema } from './ids.js';
import { rosterMemberSchema } from './people.js';
import { sportKeySchema } from './sports.js';

export const teamSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  shortName: z.string().nullable(),
  sportKeys: z.array(sportKeySchema),
  memberCount: z.number().int(),
  archived: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type Team = z.infer<typeof teamSchema>;

export const teamMemberSchema = z.object({
  id: idSchema,
  teamId: idSchema,
  rosterMemberId: idSchema,
  jerseyNumber: z.string().nullable(),
  /** Set when the member left the team; kept so past line-ups stay readable. */
  leftAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamDetailSchema = teamSchema.extend({
  members: z.array(teamMemberSchema.extend({ rosterMember: rosterMemberSchema })),
});
export type TeamDetail = z.infer<typeof teamDetailSchema>;

export const createTeamRequestSchema = z.object({
  name: z.string().trim().min(1, 'REQUIRED').max(80, 'TOO_LONG'),
  shortName: z
    .string()
    .trim()
    .max(12, 'TOO_LONG')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  sportKeys: z.array(sportKeySchema).max(12).default([]),
});
export type CreateTeamRequest = z.input<typeof createTeamRequestSchema>;

export const updateTeamRequestSchema = createTeamRequestSchema.partial();
export type UpdateTeamRequest = z.input<typeof updateTeamRequestSchema>;

export const addTeamMembersRequestSchema = z.object({
  rosterMemberIds: z.array(idSchema).min(1).max(100),
});
