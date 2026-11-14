import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz } from './columns';
import { users } from './identity';
import { matches } from './matches';

/**
 * Match awards with their provenance (ADR 0023). At most one published record per award
 * and match; replaced records stay as SUPERSEDED for the audit trail.
 */
export const awardRecords = pgTable(
  'award_records',
  {
    id: id(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    awardKey: varchar('award_key', { length: 60 }).notNull(),
    criteriaVersion: integer('criteria_version').notNull(),
    status: varchar('status', { length: 12 }).notNull(),
    provenance: varchar('provenance', { length: 10 }).notNull(),
    /** `{ participantId, side }[]`; names come from the match's participant snapshots. */
    recipients: jsonb('recipients').notNull(),
    metrics: jsonb('metrics').notNull(),
    /** The match version the record was based on; a later change makes a choice stale. */
    matchVersion: integer('match_version').notNull(),
    reason: varchar('reason', { length: 200 }),
    selectedByUserId: uuid('selected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    publishedAt: tstz('published_at').notNull().defaultNow(),
    supersededAt: tstz('superseded_at'),
  },
  (t) => [
    index('award_records_match_idx').on(t.matchId),
    uniqueIndex('award_records_published_unique')
      .on(t.matchId, t.awardKey)
      .where(sql`${t.status} in ('PUBLISHED', 'STALE')`),
    check('award_records_status_check', sql`${t.status} in ('PUBLISHED', 'STALE', 'SUPERSEDED')`),
    check('award_records_provenance_check', sql`${t.provenance} in ('AUTO', 'MANUAL', 'OVERRIDE')`),
  ],
);
