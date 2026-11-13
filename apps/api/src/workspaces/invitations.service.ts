import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatedInvitation,
  Invitation,
  InvitationPreview,
  WorkspaceSummary,
} from '@scoresphere/contracts';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { randomToken, sha256Hex } from '../common/crypto';
import { DB, type Database } from '../database/database.module';
import type { DbExecutor } from '../database/types';
import { workspaceInvitations, workspaceMemberships, workspaces } from '../database/schema';
import type { WorkspaceContext } from './workspace-access';

const INVITATION_TTL_DAYS = 7;

const INVALID_LINK = () =>
  new ApiError(404, 'NOT_FOUND', 'This invitation link is invalid or has expired.');

/** Invitations are single-use links shared over WhatsApp or similar, not SMS (ADR 0025). */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async create(
    ctx: WorkspaceContext,
    role: 'ADMIN' | 'SCORER' | 'VIEWER',
  ): Promise<CreatedInvitation> {
    if (ctx.type !== 'ORGANIZATION') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Only organization workspaces can invite members.',
      );
    }
    if (role === 'ADMIN' && ctx.role !== 'OWNER') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner can invite admins.');
    }
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(workspaceInvitations)
        .values({
          workspaceId: ctx.workspaceId,
          invitedByUserId: ctx.userId,
          role,
          tokenHash: sha256Hex(token),
          expiresAt,
        })
        .returning();
      await this.audit.record(
        {
          action: 'invitation.created',
          entityType: 'invitation',
          entityId: row!.id,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          metadata: { role },
        },
        tx,
      );
      return { ...this.toInvitation(row!), token };
    });
  }

  async listPending(ctx: WorkspaceContext): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, ctx.workspaceId),
          isNull(workspaceInvitations.acceptedAt),
          isNull(workspaceInvitations.revokedAt),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(workspaceInvitations.createdAt));
    return rows.map((r) => this.toInvitation(r));
  }

  async revoke(ctx: WorkspaceContext, invitationId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(workspaceInvitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(workspaceInvitations.id, invitationId),
            eq(workspaceInvitations.workspaceId, ctx.workspaceId),
            isNull(workspaceInvitations.acceptedAt),
            isNull(workspaceInvitations.revokedAt),
          ),
        )
        .returning({ id: workspaceInvitations.id });
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found.');
      await this.audit.record(
        {
          action: 'invitation.revoked',
          entityType: 'invitation',
          entityId: invitationId,
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
        },
        tx,
      );
    });
  }

  async preview(userId: string, token: string): Promise<InvitationPreview> {
    const invitation = await this.findPending(this.db, token);
    const [workspace] = await this.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, invitation.workspaceId));
    const membership = await this.activeMembership(this.db, invitation.workspaceId, userId);
    return {
      workspaceName: workspace!.name,
      role: invitation.role,
      alreadyMember: Boolean(membership),
    };
  }

  /** Joins the workspace. Existing members keep their current role; the link is still consumed. */
  async accept(userId: string, token: string): Promise<WorkspaceSummary> {
    return this.db.transaction(async (tx) => {
      const invitation = await this.findPending(tx, token, true);
      const existing = await this.activeMembership(tx, invitation.workspaceId, userId);
      let role = existing?.role ?? invitation.role;

      if (!existing) {
        const [membership] = await tx
          .insert(workspaceMemberships)
          .values({ workspaceId: invitation.workspaceId, userId, role: invitation.role })
          .onConflictDoUpdate({
            target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
            set: { role: invitation.role, status: 'ACTIVE', joinedAt: new Date() },
          })
          .returning({ role: workspaceMemberships.role });
        role = membership!.role;
      }

      await tx
        .update(workspaceInvitations)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(eq(workspaceInvitations.id, invitation.id));
      await this.audit.record(
        {
          action: 'invitation.accepted',
          entityType: 'invitation',
          entityId: invitation.id,
          workspaceId: invitation.workspaceId,
          actorUserId: userId,
          metadata: { role, alreadyMember: Boolean(existing) },
        },
        tx,
      );

      const [workspace] = await tx
        .select({ id: workspaces.id, type: workspaces.type, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, invitation.workspaceId));
      return { ...workspace!, role };
    });
  }

  private async findPending(executor: DbExecutor, token: string, lock = false) {
    const query = executor
      .select()
      .from(workspaceInvitations)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
      .where(
        and(
          eq(workspaceInvitations.tokenHash, sha256Hex(token)),
          isNull(workspaceInvitations.acceptedAt),
          isNull(workspaceInvitations.revokedAt),
          gt(workspaceInvitations.expiresAt, new Date()),
          isNull(workspaces.archivedAt),
        ),
      );
    const [row] = lock ? await query.for('update', { of: workspaceInvitations }) : await query;
    if (!row) throw INVALID_LINK();
    return row.workspace_invitations;
  }

  private async activeMembership(executor: DbExecutor, workspaceId: string, userId: string) {
    const [row] = await executor
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, 'ACTIVE'),
        ),
      );
    return row;
  }

  private toInvitation(row: typeof workspaceInvitations.$inferSelect): Invitation {
    return {
      id: row.id,
      role: row.role,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
