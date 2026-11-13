import type { Database } from './database.module';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories accept either the pool-level client or an open transaction. */
export type DbExecutor = Database | Transaction;

/** True when `error` (or its cause) is a Postgres unique-constraint violation. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    const pg = current as { code?: string; constraint?: string; cause?: unknown };
    if (pg.code === '23505') return constraint ? pg.constraint === constraint : true;
    current = pg.cause;
  }
  return false;
}
