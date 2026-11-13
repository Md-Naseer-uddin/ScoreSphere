import {
  createdInvitationSchema,
  type CreateOrganizationRequest,
  invitationPreviewSchema,
  invitationSchema,
  memberSchema,
  type UpdateWorkspaceRequest,
  workspaceDetailSchema,
  type WorkspaceRole,
  workspaceSummarySchema,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { apiFetch, json } from '@/lib/api';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: string) => ['workspaces', id] as const,
  members: (id: string) => ['workspaces', id, 'members'] as const,
  invitations: (id: string) => ['workspaces', id, 'invitations'] as const,
};

export const listWorkspaces = () => apiFetch('/workspaces', {}, z.array(workspaceSummarySchema));

export const getWorkspace = (id: string) =>
  apiFetch(`/workspaces/${id}`, {}, workspaceDetailSchema);

export const updateWorkspace = (id: string, patch: UpdateWorkspaceRequest) =>
  apiFetch(`/workspaces/${id}`, { method: 'PATCH', ...json(patch) }, workspaceDetailSchema);

export const createOrganization = (input: CreateOrganizationRequest) =>
  apiFetch('/organizations', { method: 'POST', ...json(input) }, workspaceSummarySchema);

export const listMembers = (id: string) =>
  apiFetch(`/workspaces/${id}/members`, {}, z.array(memberSchema));

export const changeMemberRole = (id: string, membershipId: string, role: WorkspaceRole) =>
  apiFetch(
    `/workspaces/${id}/members/${membershipId}`,
    { method: 'PATCH', ...json({ role }) },
    z.array(memberSchema),
  );

export const removeMember = (id: string, membershipId: string) =>
  apiFetch<void>(`/workspaces/${id}/members/${membershipId}`, { method: 'DELETE' });

export const listInvitations = (id: string) =>
  apiFetch(`/workspaces/${id}/invitations`, {}, z.array(invitationSchema));

export const createInvitation = (id: string, role: 'ADMIN' | 'SCORER' | 'VIEWER') =>
  apiFetch(
    `/workspaces/${id}/invitations`,
    { method: 'POST', ...json({ role }) },
    createdInvitationSchema,
  );

export const revokeInvitation = (id: string, invitationId: string) =>
  apiFetch<void>(`/workspaces/${id}/invitations/${invitationId}`, { method: 'DELETE' });

export const previewInvitation = (token: string) =>
  apiFetch('/invitations/preview', { method: 'POST', ...json({ token }) }, invitationPreviewSchema);

export const acceptInvitation = (token: string) =>
  apiFetch('/invitations/accept', { method: 'POST', ...json({ token }) }, workspaceSummarySchema);
