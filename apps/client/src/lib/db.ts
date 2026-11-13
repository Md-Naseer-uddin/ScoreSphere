import {
  newId,
  type RosterMember,
  type Team,
  type TeamMember,
  type WorkspaceSummary,
} from '@scoresphere/contracts';
import Dexie, { type EntityTable } from 'dexie';

interface Setting {
  key: string;
  value: unknown;
}

/** A device-only participant for quick matches; never uploaded as a profile (ADR 0011). */
export interface QuickGuest {
  id: string;
  /** Guests belong to the account that created them on this device. */
  ownerUserId: string;
  displayName: string;
  jerseyNumber: string | null;
  createdAt: string;
}

/**
 * The device's local database (ADR 0003). Reference tables mirror the server via
 * `/sync/reference`; quick guests exist only here.
 */
export class LocalDatabase extends Dexie {
  settings!: EntityTable<Setting, 'key'>;
  workspaces!: EntityTable<WorkspaceSummary, 'id'>;
  teams!: EntityTable<Team, 'id'>;
  teamMembers!: EntityTable<TeamMember, 'id'>;
  rosterMembers!: EntityTable<RosterMember, 'id'>;
  quickGuests!: EntityTable<QuickGuest, 'id'>;

  constructor(name = 'scoresphere') {
    super(name);
    this.version(1).stores({ settings: 'key' });
    this.version(2).stores({
      settings: 'key',
      workspaces: 'id',
      teams: 'id, workspaceId',
      teamMembers: 'id, teamId, rosterMemberId',
      rosterMembers: 'id, workspaceId',
      quickGuests: 'id, ownerUserId',
    });
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
