import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';
import { users } from './identity';
import { rosterMembers } from './people';
import { workspaces } from './workspaces';

export const teams = pgTable(
  'teams',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    shortName: varchar('short_name', { length: 12 }),
    /** Sports this team plays, by sport key; used to filter teams in match setup. */
    sportKeys: text('sport_keys')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [
    uniqueIndex('teams_workspace_name_unique')
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index('teams_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
  ],
);

export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: id(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    rosterMemberId: uuid('roster_member_id')
      .notNull()
      .references(() => rosterMembers.id, { onDelete: 'restrict' }),
    /** Overrides the roster member's default jersey for this team. */
    jerseyNumber: varchar('jersey_number', { length: 4 }),
    joinedAt: tstz('joined_at').notNull().defaultNow(),
    leftAt: tstz('left_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('team_memberships_active_unique')
      .on(t.teamId, t.rosterMemberId)
      .where(sql`${t.leftAt} is null`),
    index('team_memberships_team_idx').on(t.teamId),
  ],
);
