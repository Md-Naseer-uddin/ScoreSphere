import {
  type CreateRosterMemberRequest,
  type CreateTeamRequest,
  lookupResultSchema,
  myRosterLinkSchema,
  type RosterLinkTarget,
  rosterMemberSchema,
  teamDetailSchema,
  type UpdateRosterMemberRequest,
  type UpdateTeamRequest,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { syncReference } from '@/features/sync/reference-sync';
import { apiFetch, json } from '@/lib/api';

/** Runs a mutation, then refreshes the device copy so live queries update. */
async function thenSync<T>(promise: Promise<T>): Promise<T> {
  const result = await promise;
  await syncReference().catch(() => undefined);
  return result;
}

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`;

export const lookupPhone = (workspaceId: string, phone: string) =>
  apiFetch(
    `${ws(workspaceId)}/people/lookup`,
    { method: 'POST', ...json({ phone }) },
    lookupResultSchema,
  );

export const createRosterMember = (workspaceId: string, input: CreateRosterMemberRequest) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/roster-members`,
      { method: 'POST', ...json(input) },
      rosterMemberSchema,
    ),
  );

export const updateRosterMember = (
  workspaceId: string,
  id: string,
  patch: UpdateRosterMemberRequest,
) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/roster-members/${id}`,
      { method: 'PATCH', ...json(patch) },
      rosterMemberSchema,
    ),
  );

export const linkRosterMember = (workspaceId: string, id: string, target: RosterLinkTarget) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/roster-members/${id}/link`,
      { method: 'POST', ...json(target) },
      rosterMemberSchema,
    ),
  );

export const decideClaim = (workspaceId: string, id: string, approve: boolean) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/roster-members/${id}/${approve ? 'approve-claim' : 'reject-claim'}`,
      { method: 'POST' },
      rosterMemberSchema,
    ),
  );

export const archiveRosterMember = (workspaceId: string, id: string) =>
  thenSync(apiFetch<void>(`${ws(workspaceId)}/roster-members/${id}`, { method: 'DELETE' }));

export const createTeam = (workspaceId: string, input: CreateTeamRequest) =>
  thenSync(
    apiFetch(`${ws(workspaceId)}/teams`, { method: 'POST', ...json(input) }, teamDetailSchema),
  );

export const updateTeam = (workspaceId: string, id: string, patch: UpdateTeamRequest) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/teams/${id}`,
      { method: 'PATCH', ...json(patch) },
      teamDetailSchema,
    ),
  );

export const archiveTeam = (workspaceId: string, id: string) =>
  thenSync(apiFetch<void>(`${ws(workspaceId)}/teams/${id}`, { method: 'DELETE' }));

export const addTeamMembers = (workspaceId: string, teamId: string, rosterMemberIds: string[]) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/teams/${teamId}/members`,
      { method: 'POST', ...json({ rosterMemberIds }) },
      teamDetailSchema,
    ),
  );

export const removeTeamMember = (workspaceId: string, teamId: string, membershipId: string) =>
  thenSync(
    apiFetch(
      `${ws(workspaceId)}/teams/${teamId}/members/${membershipId}`,
      { method: 'DELETE' },
      teamDetailSchema,
    ),
  );

export const myRosterLinksKey = ['me', 'roster-links'] as const;

export const listMyRosterLinks = () =>
  apiFetch('/me/roster-links', {}, z.array(myRosterLinkSchema));

export const respondToRosterLink = (rosterMemberId: string, accept: boolean) =>
  apiFetch(
    `/me/roster-links/${rosterMemberId}/${accept ? 'accept' : 'decline'}`,
    { method: 'POST' },
    z.array(myRosterLinkSchema),
  );
