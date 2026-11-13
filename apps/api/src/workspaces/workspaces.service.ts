import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrganizationRequest,
  Member,
  UpdateWorkspaceRequest,
  WorkspaceDetail,
  WorkspaceRole,
  WorkspaceSummary,
} from '@scoresphere/contracts';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { organizations, users, workspaceMemberships, workspaces } from '../database/schema';
import { isUniqueViolation, type Transaction } from '../database/types';
import { mediaPath } from '../users/users.service';
import type { WorkspaceContext } from './workspace-access';

const ORGANIZATION_ONLY = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'Only organization workspaces can do this.');
const MEMBER_NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Member not found.');
const OWNER_ONLY = () =>
  new ApiError(403, 'FORBIDDEN', 'Only an owner can change or remove another owner.');
const LAST_OWNER = () =>
  new ApiError(409, 'CONFLICT', 'A workspace needs at least one owner.', [
    { field: 'role', code: 'LAST_OWNER' },
  ]);

/** Lower-case, hyphenated, ASCII-only slug from an organization name. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `org-${slug || 'team'}`;
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const rows = await this.db
      .select({
        id: workspaces.id,
        type: workspaces.type,
        name: workspaces.name,
        role: workspaceMemberships.role,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, 'ACTIVE'),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(asc(workspaces.type), asc(workspaces.name));
    // PERSONAL sorts after ORGANIZATION alphabetically; show the personal workspace first.
    return [
      ...rows.filter((w) => w.type === 'PERSONAL'),
      ...rows.filter((w) => w.type !== 'PERSONAL'),
    ];
  }

  async createOrganization(
    userId: string,
    input: CreateOrganizationRequest,
  ): Promise<WorkspaceSummary> {
    const base = input.slug ?? slugify(input.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 58)}-${attempt + 1}`;
      try {
        return await this.db.transaction(async (tx) => {
          const [workspace] = await tx
            .insert(workspaces)
            .values({ type: 'ORGANIZATION', name: input.name, createdByUserId: userId })
            .returning({ id: workspaces.id });
          await tx.insert(organizations).values({
            workspaceId: workspace!.id,
            slug,
            description: input.description ?? null,
          });
          await tx
            .insert(workspaceMemberships)
            .values({ workspaceId: workspace!.id, userId, role: 'OWNER' });
          await this.audit.record(
            {
              action: 'organization.created',
              entityType: 'workspace',
              entityId: workspace!.id,
              workspaceId: workspace!.id,
              actorUserId: userId,
            },
            tx,
          );
          return {
            id: workspace!.id,
            type: 'ORGANIZATION' as const,
            name: input.name,
            role: 'OWNER' as const,
          };
        });
      } catch (error) {
        // A user-chosen slug that's taken is an error; a generated one gets a numeric suffix.
        if (!isUniqueViolation(error, 'organizations_slug_unique')) throw error;
        if (input.slug) {
          throw new ApiError(409, 'CONFLICT', 'That web address is taken.', [
            { field: 'slug', code: 'SLUG_TAKEN' },
          ]);
        }
      }
    }
    throw new ApiError(409, 'CONFLICT', 'Choose a different organization name.');
  }

  async getDetail(ctx: WorkspaceContext): Promise<WorkspaceDetail> {
    const [row] = await this.db
      .select({ workspace: workspaces, organization: organizations })
      .from(workspaces)
      .leftJoin(organizations, eq(organizations.workspaceId, workspaces.id))
      .where(eq(workspaces.id, ctx.workspaceId));
    const [members] = await this.db
      .select({ value: count() })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, ctx.workspaceId),
          eq(workspaceMemberships.status, 'ACTIVE'),
        ),
      );
    const org = row!.organization;
    return {
      id: row!.workspace.id,
      type: row!.workspace.type,
      name: row!.workspace.name,
      role: ctx.role,
      organization: org
        ? { slug: org.slug, description: org.description, contactEmail: org.contactEmail }
        : null,
      memberCount: members?.value ?? 0,
    };
  }

  async update(ctx: WorkspaceContext, patch: UpdateWorkspaceRequest): Promise<WorkspaceDetail> {
    if (ctx.type !== 'ORGANIZATION') throw ORGANIZATION_ONLY();
    await this.db.transaction(async (tx) => {
      if (patch.name !== undefined) {
        await tx
          .update(workspaces)
          .set({ name: patch.name })
          .where(eq(workspaces.id, ctx.workspaceId));
      }
      const orgPatch = Object.fromEntries(
        Object.entries({ description: patch.description, contactEmail: patch.contactEmail }).filter(
          ([, v]) => v !== undefined,
        ),
      );
      if (Object.keys(orgPatch).length > 0) {
        await tx
          .update(organizations)
          .set(orgPatch)
          .where(eq(organizations.workspaceId, ctx.workspaceId));
      }
      await this.audit.record(
        {
          action: 'workspace.updated',
          entityType: 'workspace',
          entityId: ctx.workspaceId,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          metadata: { fields: Object.keys(patch) },
        },
        tx,
      );
    });
    return this.getDetail(ctx);
  }

  async listMembers(ctx: WorkspaceContext): Promise<Member[]> {
    const rows = await this.db
      .select({
        membershipId: workspaceMemberships.id,
        userId: users.id,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        role: workspaceMemberships.role,
        joinedAt: workspaceMemberships.joinedAt,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, ctx.workspaceId),
          eq(workspaceMemberships.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(workspaceMemberships.joinedAt));
    return rows.map(({ avatarKey, joinedAt, ...m }) => ({
      ...m,
      avatarUrl: mediaPath(avatarKey),
      joinedAt: joinedAt.toISOString(),
    }));
  }

  async changeRole(
    ctx: WorkspaceContext,
    membershipId: string,
    role: WorkspaceRole,
  ): Promise<Member[]> {
    if (ctx.type !== 'ORGANIZATION') throw ORGANIZATION_ONLY();
    await this.db.transaction(async (tx) => {
      const target = await this.lockMember(tx, ctx, membershipId);
      if ((target.role === 'OWNER' || role === 'OWNER') && ctx.role !== 'OWNER') throw OWNER_ONLY();
      if (target.role === 'OWNER' && role !== 'OWNER')
        await this.ensureAnotherOwner(tx, ctx, membershipId);
      await tx
        .update(workspaceMemberships)
        .set({ role })
        .where(eq(workspaceMemberships.id, membershipId));
      await this.audit.record(
        {
          action: 'membership.role_changed',
          entityType: 'membership',
          entityId: membershipId,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          metadata: { from: target.role, to: role },
        },
        tx,
      );
    });
    return this.listMembers(ctx);
  }

  /** Admins remove members; anyone may leave. The last owner can do neither. */
  async removeMember(ctx: WorkspaceContext, membershipId: string): Promise<void> {
    const leaving = membershipId === ctx.membershipId;
    if (!leaving && ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
      throw new ApiError(
        403,
        'FORBIDDEN',
        "You don't have permission to do that in this workspace.",
      );
    }
    if (ctx.type !== 'ORGANIZATION') throw ORGANIZATION_ONLY();
    await this.db.transaction(async (tx) => {
      const target = await this.lockMember(tx, ctx, membershipId);
      if (target.role === 'OWNER' && !leaving && ctx.role !== 'OWNER') throw OWNER_ONLY();
      if (target.role === 'OWNER') await this.ensureAnotherOwner(tx, ctx, membershipId);
      await tx
        .update(workspaceMemberships)
        .set({ status: 'LEFT' })
        .where(eq(workspaceMemberships.id, membershipId));
      await this.audit.record(
        {
          action: leaving ? 'membership.left' : 'membership.removed',
          entityType: 'membership',
          entityId: membershipId,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
        },
        tx,
      );
    });
  }

  private async lockMember(tx: Transaction, ctx: WorkspaceContext, membershipId: string) {
    const [target] = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.id, membershipId),
          eq(workspaceMemberships.workspaceId, ctx.workspaceId),
          eq(workspaceMemberships.status, 'ACTIVE'),
        ),
      )
      .for('update');
    if (!target) throw MEMBER_NOT_FOUND();
    return target;
  }

  private async ensureAnotherOwner(
    tx: Transaction,
    ctx: WorkspaceContext,
    exceptMembershipId: string,
  ): Promise<void> {
    const owners = await tx
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, ctx.workspaceId),
          eq(workspaceMemberships.role, 'OWNER'),
          eq(workspaceMemberships.status, 'ACTIVE'),
        ),
      )
      .for('update');
    if (!owners.some((o) => o.id !== exceptMembershipId)) throw LAST_OWNER();
  }
}
