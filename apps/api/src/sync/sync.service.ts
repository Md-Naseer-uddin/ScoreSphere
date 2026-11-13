import { Inject, Injectable } from '@nestjs/common';
import type { ReferenceSync, TeamMember } from '@scoresphere/contracts';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { rosterMembers, teamMemberships, teams } from '../database/schema';
import { selectRosterMembers } from '../people/roster-mapper';
import { selectTeams } from '../teams/teams.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

/**
 * Rows committed by transactions that started before the cursor was taken can carry an
 * earlier `updated_at`; re-reading a short overlap catches them (clients upsert idempotently).
 */
const OVERLAP_MS = 5_000;

@Injectable()
export class SyncService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Reference data for offline use across every workspace the user belongs to (plan §3.6). */
  async reference(userId: string, since: Date | null): Promise<ReferenceSync> {
    const [{ now }] = (await this.db.execute(sql`select now() as now`)).rows as [
      { now: Date | string },
    ];
    const cursor = new Date(new Date(now).getTime() - OVERLAP_MS);

    const workspaces = await this.workspaces.listForUser(userId);
    const ids = workspaces.map((w) => w.id);
    if (ids.length === 0)
      return {
        cursor: cursor.toISOString(),
        workspaces,
        teams: [],
        teamMembers: [],
        rosterMembers: [],
      };

    // A full sync skips archived rows; an incremental one includes them so the device can drop them.
    const [teamRows, rosterRows, memberRows] = await Promise.all([
      selectTeams(
        this.db,
        and(
          inArray(teams.workspaceId, ids),
          since ? gt(teams.updatedAt, since) : isNull(teams.archivedAt),
        ),
      ),
      selectRosterMembers(
        this.db,
        and(
          inArray(rosterMembers.workspaceId, ids),
          since ? gt(rosterMembers.updatedAt, since) : eq(rosterMembers.status, 'ACTIVE'),
        ),
      ),
      this.db
        .select({ membership: teamMemberships })
        .from(teamMemberships)
        .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
        .where(
          and(
            inArray(teams.workspaceId, ids),
            since ? gt(teamMemberships.updatedAt, since) : isNull(teamMemberships.leftAt),
          ),
        ),
    ]);

    const teamMembers: TeamMember[] = memberRows.map(({ membership: m }) => ({
      id: m.id,
      teamId: m.teamId,
      rosterMemberId: m.rosterMemberId,
      jerseyNumber: m.jerseyNumber,
      leftAt: m.leftAt?.toISOString() ?? null,
      updatedAt: m.updatedAt.toISOString(),
    }));
    return {
      cursor: cursor.toISOString(),
      workspaces,
      teams: teamRows,
      teamMembers,
      rosterMembers: rosterRows,
    };
  }
}
