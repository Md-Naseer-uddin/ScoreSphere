import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';
import { users } from './identity';

export const workspaceType = pgEnum('workspace_type', ['PERSONAL', 'ORGANIZATION']);
export const workspaceRole = pgEnum('workspace_role', ['OWNER', 'ADMIN', 'SCORER', 'VIEWER']);
export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'SUSPENDED', 'LEFT']);

/** The tenant boundary: every private team, match and tournament belongs to one workspace. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    type: workspaceType('type').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [
    // One personal workspace per user.
    uniqueIndex('workspaces_one_personal_per_user')
      .on(t.createdByUserId)
      .where(sql`${t.type} = 'PERSONAL'`),
  ],
);

export const organizations = pgTable('organizations', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  logoKey: varchar('logo_key', { length: 200 }),
  contactEmail: varchar('contact_email', { length: 254 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    status: membershipStatus('status').notNull().default('ACTIVE'),
    joinedAt: tstz('joined_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('workspace_memberships_workspace_user_unique').on(t.workspaceId, t.userId),
    index('workspace_memberships_user_idx').on(t.userId),
  ],
);

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    /** SHA-256 hex of the link token; the token itself is shown once. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('workspace_invitations_workspace_idx').on(t.workspaceId),
    check('workspace_invitations_role_not_owner', sql`${t.role} <> 'OWNER'`),
  ],
);
