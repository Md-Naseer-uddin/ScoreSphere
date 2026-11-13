import { z } from 'zod';
import { rosterMemberSchema } from './people.js';
import { teamMemberSchema, teamSchema } from './teams.js';
import { workspaceSummarySchema } from './workspaces.js';

/**
 * Reference data the device caches for offline use (plan §3.6). `workspaces` is always the
 * full list, so the client can drop data for workspaces it lost access to; the other lists
 * hold only rows changed since the cursor, including archived ones so they can be removed.
 */
export const referenceSyncSchema = z.object({
  cursor: z.iso.datetime(),
  workspaces: z.array(workspaceSummarySchema),
  teams: z.array(teamSchema),
  teamMembers: z.array(teamMemberSchema),
  rosterMembers: z.array(rosterMemberSchema),
});
export type ReferenceSync = z.infer<typeof referenceSyncSchema>;
