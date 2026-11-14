import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './columns';
import { users } from './identity';
import { matches } from './matches';
import { rosterMembers } from './people';
import { teams } from './teams';
import { workspaces } from './workspaces';

/** A tournament in one workspace (plan M7; cross-workspace entries come later, ADR 0023). */
export const tournaments = pgTable(
  'tournaments',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    sport: varchar('sport', { length: 20 }).notNull(),
    format: varchar('format', { length: 20 }).notNull(),
    engineVersion: integer('engine_version').notNull(),
    presetKey: varchar('preset_key', { length: 60 }).notNull(),
    presetVersion: integer('preset_version').notNull(),
    config: jsonb('config').notNull(),
    points: jsonb('points').notNull(),
    tieBreaks: jsonb('tie_breaks').notNull(),
    status: varchar('status', { length: 12 }).notNull().default('draft'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tournaments_workspace_idx').on(t.workspaceId, t.updatedAt),
    check('tournaments_format_check', sql`${t.format} in ('round_robin', 'single_elimination')`),
    check('tournaments_status_check', sql`${t.status} in ('draft', 'active', 'completed')`),
  ],
);

/** A team, or a roster member in individual sports; exactly one of the two. */
export const tournamentEntries = pgTable(
  'tournament_entries',
  {
    id: id(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'restrict' }),
    rosterMemberId: uuid('roster_member_id').references(() => rosterMembers.id, {
      onDelete: 'restrict',
    }),
    /** Snapshot shown in fixtures and standings. */
    displayName: varchar('display_name', { length: 120 }).notNull(),
    seed: integer('seed').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'tournament_entries_one_kind',
      sql`(${t.teamId} is null) <> (${t.rosterMemberId} is null)`,
    ),
    uniqueIndex('tournament_entries_team_unique')
      .on(t.tournamentId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    uniqueIndex('tournament_entries_member_unique')
      .on(t.tournamentId, t.rosterMemberId)
      .where(sql`${t.rosterMemberId} is not null`),
  ],
);

/**
 * A fixture: sides may be unknown until earlier knockout rounds finish, and its match is
 * created when someone scores it (ADR 0023 fixes the spec's `match_id NOT NULL`).
 */
export const tournamentFixtures = pgTable(
  'tournament_fixtures',
  {
    id: id(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    position: integer('position').notNull(),
    side1EntryId: uuid('side1_entry_id').references((): AnyPgColumn => tournamentEntries.id, {
      onDelete: 'restrict',
    }),
    side2EntryId: uuid('side2_entry_id').references((): AnyPgColumn => tournamentEntries.id, {
      onDelete: 'restrict',
    }),
    bye: boolean('bye').notNull().default(false),
    matchId: uuid('match_id')
      .unique()
      .references(() => matches.id, { onDelete: 'set null' }),
    winnerEntryId: uuid('winner_entry_id').references((): AnyPgColumn => tournamentEntries.id, {
      onDelete: 'restrict',
    }),
    /** Knockout: where the winner goes next. */
    nextRound: integer('next_round'),
    nextPosition: integer('next_position'),
    nextSlot: smallint('next_slot'),
    /** The match ended level in a knockout; an organizer picks who advances. */
    needsDecision: boolean('needs_decision').notNull().default(false),
    /** Set when an organizer chose the winner of a level knockout match. */
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tournament_fixtures_slot_unique').on(t.tournamentId, t.round, t.position),
    index('tournament_fixtures_tournament_idx').on(t.tournamentId),
  ],
);
