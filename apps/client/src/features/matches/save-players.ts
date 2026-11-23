import { newId, type RosterMember } from '@scoresphere/contracts';
import { addTeamMembers, createRosterMembers } from '@/features/teams/teams-api';
import { db } from '@/lib/db';
import { type KnownPlayer, normalizeName } from './players';

/** Match setup never waits longer than this for the network; the match starts either way. */
const SAVE_TIMEOUT_MS = 6000;

export interface PlayerToSave {
  name: string;
  /** A guest saved on this device, promoted to the roster when that works. */
  guest: KnownPlayer | null;
}

/**
 * Keeps the players of a new match for next time. Online scorers get them on the workspace
 * roster (shared with other devices, collecting stats); otherwise, or if that fails or is
 * slow, new names become guests on this device. Returns roster IDs by normalised name.
 * A request still running at the timeout may finish later: that player then appears in the
 * list next time, just not linked to this match.
 */
export async function savePlayers(input: {
  workspaceId: string;
  ownerUserId: string;
  players: PlayerToSave[];
  toRoster: boolean;
}): Promise<Map<string, string>> {
  const saved = new Map<string, string>();
  const players = input.players.filter(
    (p, i, all) => all.findIndex((q) => normalizeName(q.name) === normalizeName(p.name)) === i,
  );
  if (players.length === 0) return saved;

  if (input.toRoster && navigator.onLine) {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SAVE_TIMEOUT_MS),
    );
    const results = await Promise.race([
      createRosterMembers(
        input.workspaceId,
        players.map((p) => p.name),
      ).catch(() => null),
      timeout,
    ]);
    const created: RosterMember[] = [];
    results?.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      created.push(result.value);
      saved.set(normalizeName(players[i]!.name), result.value.id);
    });
    if (created.length) await db.rosterMembers.bulkPut(created);
    const promoted = players
      .filter((p) => p.guest && saved.has(normalizeName(p.name)))
      .map((p) => p.guest!.value.slice('guest:'.length));
    if (promoted.length) await db.quickGuests.bulkDelete(promoted);
  }

  const now = new Date().toISOString();
  const guests = players
    .filter((p) => !p.guest && !saved.has(normalizeName(p.name)))
    .map((p) => ({
      id: newId(),
      ownerUserId: input.ownerUserId,
      displayName: p.name,
      jerseyNumber: null,
      createdAt: now,
    }));
  if (guests.length) await db.quickGuests.bulkAdd(guests);
  return saved;
}

/**
 * Players who play for a saved team join it, so its next match (a tournament's next round,
 * say) starts with them filled in. Best effort, online only; the match never waits on it.
 */
export async function addPlayersToTeam(
  workspaceId: string,
  teamId: string,
  rosterMemberIds: string[],
): Promise<void> {
  if (!navigator.onLine || rosterMemberIds.length === 0) return;
  const members = await db.teamMembers.where('teamId').equals(teamId).toArray();
  const current = new Set(members.map((m) => m.rosterMemberId));
  const missing = [...new Set(rosterMemberIds)].filter((id) => !current.has(id));
  if (missing.length) await addTeamMembers(workspaceId, teamId, missing);
}
