import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, idSchema, type WorkspaceRole } from '@scoresphere/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { workspaceMemberships, workspaces } from '../database/schema';

/** The caller's verified access to one workspace. Every workspace-scoped query takes this. */
export interface WorkspaceContext {
  workspaceId: string;
  type: 'PERSONAL' | 'ORGANIZATION';
  userId: string;
  membershipId: string;
  role: WorkspaceRole;
}

type WorkspaceRequest = AuthenticatedRequest & { workspace?: WorkspaceContext };

const MIN_ROLE = 'scoresphere:min-workspace-role';

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Workspace not found.');

/**
 * Resolves `:workspaceId` to the caller's active membership. Non-members get 404 so
 * workspace existence isn't revealed; members below the required role get 403.
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceRequest>();
    const user = req.user;
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

    const parsed = idSchema.safeParse(req.params.workspaceId);
    if (!parsed.success) throw notFound();

    const [row] = await this.db
      .select({
        membershipId: workspaceMemberships.id,
        role: workspaceMemberships.role,
        type: workspaces.type,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, parsed.data),
          eq(workspaceMemberships.userId, user.id),
          eq(workspaceMemberships.status, 'ACTIVE'),
          isNull(workspaces.archivedAt),
        ),
      );
    if (!row) throw notFound();

    const required = this.reflector.get<WorkspaceRole | undefined>(MIN_ROLE, context.getHandler());
    if (required && !hasRole(row.role, required)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        "You don't have permission to do that in this workspace.",
      );
    }

    req.workspace = { workspaceId: parsed.data, userId: user.id, ...row };
    return true;
  }
}

/** Requires an active membership in `:workspaceId` with at least `role`. */
export const WorkspaceRoute = (role: WorkspaceRole) =>
  applyDecorators(SetMetadata(MIN_ROLE, role), UseGuards(WorkspaceAccessGuard));

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceContext => {
    const workspace = ctx.switchToHttp().getRequest<WorkspaceRequest>().workspace;
    if (!workspace) throw new Error('CurrentWorkspace used without @WorkspaceRoute');
    return workspace;
  },
);
