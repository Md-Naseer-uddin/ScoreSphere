import { referenceSyncSchema } from '@scoresphere/contracts';
import { useEffect } from 'react';
import { useSession } from '@/features/auth/session';
import { apiFetch } from '@/lib/api';
import { db, type LocalDatabase } from '@/lib/db';

const CURSOR_KEY = 'referenceCursor';
const MIN_INTERVAL_MS = 30_000;

let inflight: Promise<void> | null = null;
let lastRun = 0;

/**
 * Pulls workspaces, teams and rosters into the device database (plan §3.6). The first run
 * downloads everything; later runs fetch only changes since the stored cursor.
 */
export function syncReference(database: LocalDatabase = db): Promise<void> {
  inflight ??= run(database).finally(() => {
    inflight = null;
    lastRun = Date.now();
  });
  return inflight;
}

async function run(database: LocalDatabase): Promise<void> {
  const stored = await database.settings.get(CURSOR_KEY);
  const since = typeof stored?.value === 'string' ? stored.value : null;
  const data = await apiFetch(
    `/sync/reference${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    {},
    referenceSyncSchema,
  );

  await database.transaction(
    'rw',
    [
      database.workspaces,
      database.teams,
      database.teamMembers,
      database.rosterMembers,
      database.settings,
    ],
    async () => {
      // Drop everything from workspaces the user no longer belongs to.
      const allowed = new Set(data.workspaces.map((w) => w.id));
      await database.workspaces.clear();
      await database.workspaces.bulkPut(data.workspaces);
      const goneTeams = await database.teams
        .filter((t) => !allowed.has(t.workspaceId))
        .primaryKeys();
      await database.teams.bulkDelete(goneTeams);
      await database.teamMembers.where('teamId').anyOf(goneTeams).delete();
      await database.rosterMembers.filter((m) => !allowed.has(m.workspaceId)).delete();

      await database.teams.bulkPut(data.teams.filter((t) => !t.archived));
      await database.teams.bulkDelete(data.teams.filter((t) => t.archived).map((t) => t.id));
      await database.teamMembers
        .where('teamId')
        .anyOf(data.teams.filter((t) => t.archived).map((t) => t.id))
        .delete();
      await database.teamMembers.bulkPut(data.teamMembers.filter((m) => !m.leftAt));
      await database.teamMembers.bulkDelete(
        data.teamMembers.filter((m) => m.leftAt).map((m) => m.id),
      );
      await database.rosterMembers.bulkPut(data.rosterMembers.filter((m) => !m.archived));
      await database.rosterMembers.bulkDelete(
        data.rosterMembers.filter((m) => m.archived).map((m) => m.id),
      );

      await database.settings.put({ key: CURSOR_KEY, value: data.cursor });
    },
  );
}

/** Removes cached reference data, e.g. on sign-out, so the next user starts clean. */
export async function clearReferenceData(database: LocalDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.workspaces,
      database.teams,
      database.teamMembers,
      database.rosterMembers,
      database.settings,
    ],
    async () => {
      await Promise.all([
        database.workspaces.clear(),
        database.teams.clear(),
        database.teamMembers.clear(),
        database.rosterMembers.clear(),
        database.settings.delete(CURSOR_KEY),
      ]);
    },
  );
}

/** Keeps reference data fresh while signed in: on start, on reconnect and on return to the app. */
export function useReferenceSync(): void {
  const authenticated = useSession((s) => s.status === 'authenticated');
  useEffect(() => {
    if (!authenticated) return;
    const sync = (force = false) => {
      if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return;
      void syncReference().catch(() => undefined);
    };
    sync(true);
    const onFocus = () => sync();
    const onOnline = () => sync(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [authenticated]);
}
