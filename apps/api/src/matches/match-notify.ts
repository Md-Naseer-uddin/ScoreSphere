import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../database/types';

/** Postgres channel that carries `{ matchId, version }` after every committed change. */
export const MATCH_UPDATES_CHANNEL = 'match_updates';

export interface MatchUpdateNotice {
  matchId: string;
  version: number;
}

/**
 * Issued inside the write transaction: Postgres delivers it only if the transaction
 * commits, so listeners never see an update that was rolled back (ADR 0002).
 */
export async function notifyMatchUpdate(
  db: DbExecutor,
  matchId: string,
  version: number,
): Promise<void> {
  const notice: MatchUpdateNotice = { matchId, version };
  await db.execute(sql`select pg_notify(${MATCH_UPDATES_CHANNEL}, ${JSON.stringify(notice)})`);
}
