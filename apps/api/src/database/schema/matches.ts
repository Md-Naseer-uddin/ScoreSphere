import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';
import { users } from './identity';
import { rosterMembers } from './people';
import { teams } from './teams';
import { workspaces } from './workspaces';

/**
 * A match is materialised from its ledger (ADR 0008). Everything except the header
 * (workspace, sides, participants) is a projection of `match_events`, kept here so lists
 * and spectators don't replay the ledger.
 */
export const matches = pgTable(
  'matches',
  {
    /** Minted on the device that created the match, possibly offline. */
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sport: varchar('sport', { length: 20 }).notNull(),
    engineVersion: integer('engine_version').notNull(),
    presetKey: varchar('preset_key', { length: 60 }).notNull(),
    presetVersion: integer('preset_version').notNull(),
    title: varchar('title', { length: 80 }),
    resolvedConfig: jsonb('resolved_config').notNull(),
    /** Engine state after the last accepted event. */
    currentState: jsonb('current_state'),
    status: varchar('status', { length: 12 }).notNull().default('scheduled'),
    result: jsonb('result'),
    /** Highest accepted `seq`. */
    version: integer('version').notNull().default(0),
    /** Fencing token: bumped whenever another device takes the lease (ADR 0007). */
    leaseEpoch: integer('lease_epoch').notNull().default(1),
    leaseDeviceId: varchar('lease_device_id', { length: 64 }),
    leaseUserId: uuid('lease_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Last time the lease holder reached the server; spectators use it for the stale badge. */
    scorerSeenAt: tstz('scorer_seen_at'),
    /** The server engine disagreed with an accepted event (ADR 0009). */
    needsReview: boolean('needs_review').notNull().default(false),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: tstz('started_at'),
    endedAt: tstz('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('matches_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
    check(
      'matches_status_check',
      sql`${t.status} in ('scheduled', 'live', 'paused', 'completed', 'abandoned')`,
    ),
  ],
);

export const matchSides = pgTable(
  'match_sides',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    side: smallint('side').notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.side] }),
    check('match_sides_side_check', sql`${t.side} in (0, 1)`),
  ],
);

/**
 * Who played, as a snapshot (ADR 0011, 0024). Events refer to `id`; names live only
 * here, so erasing a person means updating these rows, never the ledger.
 */
export const matchSideParticipants = pgTable(
  'match_side_participants',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    side: smallint('side').notNull(),
    position: smallint('position').notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull(),
    /** Null for quick guests and typed-in names. */
    rosterMemberId: uuid('roster_member_id').references(() => rosterMembers.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('match_side_participants_match_idx').on(t.matchId, t.side, t.position)],
);

const eventColumns = () => ({
  eventId: uuid('event_id').notNull(),
  seq: integer('seq').notNull(),
  kind: varchar('kind', { length: 12 }).notNull(),
  payload: jsonb('payload').notNull(),
  targetSeq: integer('target_seq'),
  leaseEpoch: integer('lease_epoch').notNull(),
  engineVersion: integer('engine_version').notNull(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  /** Device clock (ADR 0006). */
  occurredAt: tstz('occurred_at').notNull(),
  receivedAt: tstz('received_at').notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
});

/** The append-only ledger. Rows are never updated or deleted while the match exists. */
export const matchEvents = pgTable(
  'match_events',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    ...eventColumns(),
    /** Accepted although the server engine rejected it (ADR 0009). */
    flagged: boolean('flagged').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.seq] }),
    unique('match_events_event_unique').on(t.matchId, t.eventId),
  ],
);

/** Events the server refused, kept for review and export instead of being dropped. */
export const matchEventRejections = pgTable(
  'match_event_rejections',
  {
    id: id(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    ...eventColumns(),
    outcome: varchar('outcome', { length: 20 }).notNull(),
    code: varchar('code', { length: 40 }).notNull(),
  },
  (t) => [unique('match_event_rejections_event_unique').on(t.matchId, t.eventId)],
);

export const matchShareLinks = pgTable(
  'match_share_links',
  {
    id: id(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    expiresAt: tstz('expires_at'),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [index('match_share_links_match_idx').on(t.matchId)],
);
