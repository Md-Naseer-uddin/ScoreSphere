import {
  type MatchEventKind,
  type MatchSideSnapshot,
  type MatchStatus,
  newId,
  type RosterMember,
  type SideIndex,
  type SportKey,
  type Team,
  type TeamMember,
  type WorkspaceSummary,
} from '@scoresphere/contracts';
import Dexie, { type EntityTable, type Table } from 'dexie';

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

/** A match as this device knows it. Its ledger lives in `matchEvents`. */
export interface LocalMatch {
  id: string;
  /** The account that scored or opened it here; other accounts on the device never see it. */
  ownerUserId: string;
  workspaceId: string;
  sport: SportKey;
  engineVersion: number;
  presetKey: string;
  presetVersion: number;
  title: string | null;
  sides: MatchSideSnapshot[];
  status: MatchStatus;
  resultSummary: string;
  winnerSide: SideIndex | null;
  /** Highest local `seq`. */
  version: number;
  leaseEpoch: number;
  /** Whether this device is the match's scorer (ADR 0007). */
  holdsLease: boolean;
  /** Whether the server has the match (its first batch was accepted). */
  serverKnown: boolean;
  needsReview: boolean;
  /** A sync attempt failed in a way retrying won't fix; shown as "action required". */
  syncError: string | null;
  /** The tournament fixture this match is played for, sent with the header (plan M7). */
  fixtureId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventSyncState = 'pending' | 'synced' | 'conflict' | 'rejected';

/** One ledger event. The sync queue is simply the events still `pending` (ADR 0004). */
export interface LocalMatchEvent {
  matchId: string;
  seq: number;
  eventId: string;
  kind: MatchEventKind;
  payload: Record<string, unknown>;
  targetSeq: number | null;
  leaseEpoch: number;
  engineVersion: number;
  occurredAt: number;
  sync: EventSyncState;
  /** Why the server refused it, for `conflict` and `rejected`. */
  code: string | null;
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
  matches!: EntityTable<LocalMatch, 'id'>;
  matchEvents!: Table<LocalMatchEvent, [string, number]>;

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
    this.version(3).stores({
      matches: 'id, ownerUserId, [ownerUserId+workspaceId], updatedAt',
      matchEvents: '[matchId+seq], eventId, [matchId+sync]',
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
