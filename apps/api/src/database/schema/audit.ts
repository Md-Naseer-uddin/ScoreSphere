import { index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns';

/** Security and business audit trail. Never store raw phone numbers, passwords or tokens here. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    workspaceId: uuid('workspace_id'),
    actorUserId: uuid('actor_user_id'),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_workspace_idx').on(t.workspaceId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
  ],
);
