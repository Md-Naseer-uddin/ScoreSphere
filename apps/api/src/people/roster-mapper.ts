import type { RosterLinkState, RosterMember } from '@scoresphere/contracts';
import { eq, type SQL } from 'drizzle-orm';
import { persons, rosterMembers, users } from '../database/schema';
import type { DbExecutor } from '../database/types';
import { mediaPath } from '../users/users.service';

type LinkStatus = (typeof rosterMembers.$inferSelect)['linkStatus'];

/** Both "waiting" states look the same from outside, so invites never reveal registration (ADR 0012). */
export function publicLinkState(status: LinkStatus): RosterLinkState {
  if (status === 'PENDING_CONSENT' || status === 'PENDING_CLAIM') return 'INVITED';
  return status;
}

/** Loads roster members with only the account details each link state allows. */
export async function selectRosterMembers(
  executor: DbExecutor,
  where: SQL | undefined,
): Promise<RosterMember[]> {
  const rows = await executor
    .select({
      member: rosterMembers,
      accountName: users.displayName,
      avatarKey: users.avatarKey,
    })
    .from(rosterMembers)
    .leftJoin(persons, eq(persons.id, rosterMembers.personId))
    .leftJoin(users, eq(users.id, persons.userId))
    .where(where)
    .orderBy(rosterMembers.displayName);
  return rows.map(({ member, accountName, avatarKey }) => ({
    id: member.id,
    workspaceId: member.workspaceId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    link: publicLinkState(member.linkStatus),
    avatarUrl: member.linkStatus === 'LINKED' ? mediaPath(avatarKey) : null,
    claimantName: member.linkStatus === 'AWAITING_APPROVAL' ? accountName : null,
    archived: member.status === 'ARCHIVED',
    updatedAt: member.updatedAt.toISOString(),
  }));
}
