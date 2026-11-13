import { z } from 'zod';
import { idSchema } from './ids.js';

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'SCORER', 'VIEWER'] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Higher number = more authority. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  SCORER: 2,
  VIEWER: 1,
};

export function hasRole(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const workspaceTypeSchema = z.enum(['PERSONAL', 'ORGANIZATION']);

export const workspaceSummarySchema = z.object({
  id: idSchema,
  type: workspaceTypeSchema,
  name: z.string(),
  role: workspaceRoleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const organizationProfileSchema = z.object({
  slug: z.string(),
  description: z.string().nullable(),
  contactEmail: z.string().nullable(),
});

export const workspaceDetailSchema = workspaceSummarySchema.extend({
  organization: organizationProfileSchema.nullable(),
  memberCount: z.number().int(),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, 'INVALID_SLUG');

export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).optional(),
});
export type CreateOrganizationRequest = z.input<typeof createOrganizationRequestSchema>;

export const updateWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  contactEmail: z.email().max(254).nullable().optional(),
});
export type UpdateWorkspaceRequest = z.input<typeof updateWorkspaceRequestSchema>;

export const memberSchema = z.object({
  membershipId: idSchema,
  userId: idSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: workspaceRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberRequestSchema = z.object({ role: workspaceRoleSchema });

/** Invitations are shared as links; OWNER can't be granted by invite. */
export const createInvitationRequestSchema = z.object({
  role: z.enum(['ADMIN', 'SCORER', 'VIEWER']),
});

export const invitationSchema = z.object({
  id: idSchema,
  role: workspaceRoleSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** The token is returned once at creation and travels in the link fragment (`/join#<token>`). */
export const createdInvitationSchema = invitationSchema.extend({ token: z.string() });
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const invitationTokenRequestSchema = z.object({ token: z.string().min(16).max(128) });

export const invitationPreviewSchema = z.object({
  workspaceName: z.string(),
  role: workspaceRoleSchema,
  alreadyMember: z.boolean(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
