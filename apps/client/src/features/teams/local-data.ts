import { type RosterMember, type Team } from '@scoresphere/contracts';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSession } from '@/features/auth/session';
import { db, type QuickGuest } from '@/lib/db';

/** Teams in a workspace, read from the device so the list works offline. */
export function useTeams(workspaceId: string | undefined): Team[] | undefined {
  return useLiveQuery(async () => {
    if (!workspaceId) return [];
    const teams = await db.teams.where('workspaceId').equals(workspaceId).toArray();
    const members = await db.teamMembers
      .where('teamId')
      .anyOf(teams.map((t) => t.id))
      .toArray();
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.teamId, (counts.get(m.teamId) ?? 0) + 1);
    return teams
      .map((t) => ({ ...t, memberCount: counts.get(t.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workspaceId]);
}

export interface TeamWithMembers {
  team: Team;
  members: { membershipId: string; jerseyNumber: string | null; rosterMember: RosterMember }[];
}

export function useTeam(teamId: string | undefined): TeamWithMembers | null | undefined {
  return useLiveQuery(async () => {
    if (!teamId) return null;
    const team = await db.teams.get(teamId);
    if (!team) return null;
    const memberships = await db.teamMembers.where('teamId').equals(teamId).toArray();
    const roster = await db.rosterMembers.bulkGet(memberships.map((m) => m.rosterMemberId));
    const members = memberships
      .map((m, i) => ({
        membershipId: m.id,
        jerseyNumber: m.jerseyNumber,
        rosterMember: roster[i],
      }))
      .filter((m): m is TeamWithMembers['members'][number] => Boolean(m.rosterMember))
      .sort((a, b) => a.rosterMember.displayName.localeCompare(b.rosterMember.displayName));
    return { team, members };
  }, [teamId]);
}

export function useRoster(workspaceId: string | undefined): RosterMember[] | undefined {
  return useLiveQuery(async () => {
    if (!workspaceId) return [];
    const members = await db.rosterMembers.where('workspaceId').equals(workspaceId).toArray();
    return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [workspaceId]);
}

/** Quick guests created on this device by the signed-in account. */
export function useQuickGuests(): QuickGuest[] | undefined {
  const userId = useSession((s) => s.user?.id);
  return useLiveQuery(async () => {
    if (!userId) return [];
    const guests = await db.quickGuests.where('ownerUserId').equals(userId).toArray();
    return guests.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [userId]);
}
