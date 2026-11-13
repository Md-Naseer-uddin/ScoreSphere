import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './columns';
import { phoneIdentities, users } from './identity';
import { workspaces } from './workspaces';

export const personStatus = pgEnum('person_status', ['PENDING_CLAIM', 'CLAIMED', 'ARCHIVED']);

/**
 * How a roster member relates to a global person (ADR 0010, 0011, 0013, 0029):
 * - NONE: roster-only, no phone, private to the workspace.
 * - LINKED: confirmed link to a person.
 * - PENDING_CONSENT: invited an existing account; waiting for that user to accept.
 * - PENDING_CLAIM: invited a number with no account yet; waiting for sign-up.
 * - AWAITING_APPROVAL: the new user said "that's me"; waiting for a workspace admin.
 * The API reports PENDING_CONSENT and PENDING_CLAIM as one INVITED state (ADR 0012).
 */
export const rosterLinkStatus = pgEnum('roster_link_status', [
  'NONE',
  'LINKED',
  'PENDING_CONSENT',
  'PENDING_CLAIM',
  'AWAITING_APPROVAL',
]);

export const rosterMemberStatus = pgEnum('roster_member_status', ['ACTIVE', 'ARCHIVED']);

/** One sporting identity per real person, shared across workspaces (ADR 0010). */
export const persons = pgTable('persons', {
  id: id(),
  phoneIdentityId: uuid('phone_identity_id')
    .unique()
    .references(() => phoneIdentities.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .unique()
    .references(() => users.id, { onDelete: 'set null' }),
  status: personStatus('status').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A workspace's view of a participant: its own name for them, optionally linked to a person. */
export const rosterMembers = pgTable(
  'roster_members',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').references(() => persons.id, { onDelete: 'set null' }),
    linkStatus: rosterLinkStatus('link_status').notNull().default('NONE'),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    jerseyNumber: varchar('jersey_number', { length: 4 }),
    status: rosterMemberStatus('status').notNull().default('ACTIVE'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A person appears at most once per workspace roster.
    uniqueIndex('roster_members_workspace_person_unique')
      .on(t.workspaceId, t.personId)
      .where(sql`${t.personId} is not null`),
    index('roster_members_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
    index('roster_members_person_idx').on(t.personId),
    // Linked or invited members always point at a person; roster-only members never do.
    check(
      'roster_members_link_matches_person',
      sql`(${t.linkStatus} = 'NONE') = (${t.personId} is null)`,
    ),
  ],
);
