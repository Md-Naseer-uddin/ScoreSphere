import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';
import { users } from './identity';
import { workspaces } from './workspaces';

/**
 * Custom rulesets (plan D16b, ADR 0032): match settings plus trigger-condition-action
 * rules. Versions are immutable; a match copies the version it uses into its CREATED event.
 */
export const rulesets = pgTable(
  'rulesets',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sport: varchar('sport', { length: 20 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    latestVersion: integer('latest_version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [
    uniqueIndex('rulesets_workspace_name_unique')
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index('rulesets_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
  ],
);

export const rulesetVersions = pgTable(
  'ruleset_versions',
  {
    id: id(),
    rulesetId: uuid('ruleset_id')
      .notNull()
      .references(() => rulesets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    engineVersion: integer('engine_version').notNull(),
    basePresetKey: varchar('base_preset_key', { length: 60 }).notNull(),
    config: jsonb('config').notNull(),
    rules: jsonb('rules').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [unique('ruleset_versions_version_unique').on(t.rulesetId, t.version)],
);
