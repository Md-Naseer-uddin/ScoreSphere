import { newId } from '@scoresphere/contracts';
import Dexie, { type EntityTable } from 'dexie';

interface Setting {
  key: string;
  value: unknown;
}

/**
 * The device's local database (ADR 0003). Offline matches, the sync queue and
 * cached reference data get their own tables in later milestones.
 */
export class LocalDatabase extends Dexie {
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'scoresphere') {
    super(name);
    this.version(1).stores({ settings: 'key' });
  }
}

export const db = new LocalDatabase();

/** Stable per-installation ID, created on first run. Scoring events carry it as their device ID. */
export async function getDeviceId(database: LocalDatabase = db): Promise<string> {
  return database.transaction('rw', database.settings, async () => {
    const existing = await database.settings.get('deviceId');
    if (typeof existing?.value === 'string') return existing.value;
    const id = newId();
    await database.settings.put({ key: 'deviceId', value: id });
    return id;
  });
}
