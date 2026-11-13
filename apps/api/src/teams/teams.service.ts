import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTeamRequest,
  SportKey,
  Team,
  TeamDetail,
  UpdateTeamRequest,
} from '@scoresphere/contracts';
import { and, count, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { rosterMembers, teamMemberships, teams } from '../database/schema';
import { type DbExecutor, isUniqueViolation } from '../database/types';
import { selectRosterMembers } from '../people/roster-mapper';
import type { WorkspaceContext } from '../workspaces/workspace-access';

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Team not found.');
const NAME_TAKEN = () =>
  new ApiError(409, 'CONFLICT', 'A team with this name already exists.', [
    { field: 'name', code: 'TEAM_NAME_TAKEN' },
  ]);

/** Maps team rows (with an active-member count) to the API shape. */
export async function selectTeams(executor: DbExecutor, where: SQL | undefined): Promise<Team[]> {
  const rows = await executor
    .select({ team: teams, memberCount: count(teamMemberships.id) })
    .from(teams)
    .leftJoin(
      teamMemberships,
      and(eq(teamMemberships.teamId, teams.id), isNull(teamMemberships.leftAt)),
    )
    .where(where)
    .groupBy(teams.id)
    .orderBy(teams.name);
  return rows.map(({ team, memberCount }) => ({
    id: team.id,
    workspaceId: team.workspaceId,
    name: team.name,
    shortName: team.shortName,
    sportKeys: team.sportKeys as SportKey[],
    memberCount,
    archived: team.archivedAt !== null,
    updatedAt: team.updatedAt.toISOString(),
  }));
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list(ctx: WorkspaceContext): Promise<Team[]> {
    return selectTeams(
      this.db,
      and(eq(teams.workspaceId, ctx.workspaceId), isNull(teams.archivedAt)),
    );
  }

  async get(ctx: WorkspaceContext, id: string): Promise<TeamDetail> {
    const [team] = await selectTeams(
      this.db,
      and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId)),
    );
    if (!team || team.archived) throw NOT_FOUND();
    const memberships = await this.db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, id), isNull(teamMemberships.leftAt)));
    if (memberships.length === 0) return { ...team, members: [] };
    const roster = await selectRosterMembers(
      this.db,
      inArray(
        rosterMembers.id,
        memberships.map((m) => m.rosterMemberId),
      ),
    );
    const byId = new Map(roster.map((r) => [r.id, r]));
    const members = memberships
      .map((m) => ({
        id: m.id,
        teamId: m.teamId,
        rosterMemberId: m.rosterMemberId,
        jerseyNumber: m.jerseyNumber,
        leftAt: null,
        updatedAt: m.updatedAt.toISOString(),
        rosterMember: byId.get(m.rosterMemberId)!,
      }))
      .sort((a, b) => a.rosterMember.displayName.localeCompare(b.rosterMember.displayName));
    return { ...team, members };
  }

  async create(ctx: WorkspaceContext, input: CreateTeamRequest): Promise<TeamDetail> {
    let id: string;
    try {
      const [row] = await this.db
        .insert(teams)
        .values({
          workspaceId: ctx.workspaceId,
          name: input.name,
          shortName: input.shortName ?? null,
          sportKeys: input.sportKeys ?? [],
          createdByUserId: ctx.userId,
        })
        .returning({ id: teams.id });
      id = row!.id;
    } catch (error) {
      if (isUniqueViolation(error, 'teams_workspace_name_unique')) throw NAME_TAKEN();
      throw error;
    }
    await this.audit.record({
      action: 'team.created',
      entityType: 'team',
      entityId: id,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
    });
    return this.get(ctx, id);
  }

  async update(ctx: WorkspaceContext, id: string, patch: UpdateTeamRequest): Promise<TeamDetail> {
    const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length > 0) {
      try {
        const [row] = await this.db
          .update(teams)
          .set(values)
          .where(
            and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId), isNull(teams.archivedAt)),
          )
          .returning({ id: teams.id });
        if (!row) throw NOT_FOUND();
      } catch (error) {
        if (isUniqueViolation(error, 'teams_workspace_name_unique')) throw NAME_TAKEN();
        throw error;
      }
    }
    return this.get(ctx, id);
  }

  async archive(ctx: WorkspaceContext, id: string): Promise<void> {
    const [row] = await this.db
      .update(teams)
      .set({ archivedAt: new Date() })
      .where(
        and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId), isNull(teams.archivedAt)),
      )
      .returning({ id: teams.id });
    if (!row) throw NOT_FOUND();
    await this.audit.record({
      action: 'team.archived',
      entityType: 'team',
      entityId: id,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
    });
  }

  /** Adds roster members to a team; members already on it are left as they are. */
  async addMembers(
    ctx: WorkspaceContext,
    id: string,
    rosterMemberIds: string[],
  ): Promise<TeamDetail> {
    await this.requireTeam(ctx, id);
    const unique = [...new Set(rosterMemberIds)];
    const valid = await this.db
      .select({ id: rosterMembers.id })
      .from(rosterMembers)
      .where(
        and(
          inArray(rosterMembers.id, unique),
          eq(rosterMembers.workspaceId, ctx.workspaceId),
          eq(rosterMembers.status, 'ACTIVE'),
        ),
      );
    if (valid.length !== unique.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Some roster members were not found.', [
        { field: 'rosterMemberIds', code: 'UNKNOWN_ROSTER_MEMBER' },
      ]);
    }
    await this.db
      .insert(teamMemberships)
      .values(unique.map((rosterMemberId) => ({ teamId: id, rosterMemberId })))
      .onConflictDoNothing();
    return this.get(ctx, id);
  }

  async removeMember(ctx: WorkspaceContext, id: string, membershipId: string): Promise<TeamDetail> {
    await this.requireTeam(ctx, id);
    const [row] = await this.db
      .update(teamMemberships)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMemberships.id, membershipId),
          eq(teamMemberships.teamId, id),
          isNull(teamMemberships.leftAt),
        ),
      )
      .returning({ id: teamMemberships.id });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Team member not found.');
    return this.get(ctx, id);
  }

  private async requireTeam(ctx: WorkspaceContext, id: string): Promise<void> {
    const [team] = await this.db
      .select({ id: teams.id })
      .from(teams)
      .where(
        and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId), isNull(teams.archivedAt)),
      );
    if (!team) throw NOT_FOUND();
  }
}
