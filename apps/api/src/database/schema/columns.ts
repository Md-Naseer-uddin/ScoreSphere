import { newId } from '@scoresphere/contracts';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** UUIDv7 primary key generated in the app, so offline clients can mint IDs too (ADR 0022). */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => newId());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tstz = (name: string) => timestamp(name, { withTimezone: true });
