import { Inject, Injectable } from '@nestjs/common';
import type { MyRosterLink } from '@scoresphere/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { persons, rosterMembers, workspaces } from '../database/schema';
import type { Transaction } from '../database/types';

const WAITING = ['PENDING_CONSENT', 'PENDING_CLAIM', 'AWAITING_APPROVAL'] as const;

/** The signed-in user's side of roster links: workspaces that added them (ADR 0013). */
@Injectable()
export class RosterLinksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listMine(userId: string): Promise<MyRosterLink[]> {
    const rows = await this.db
      .select({
        rosterMemberId: rosterMembers.id,
        workspaceName: workspaces.name,
        nameUsed: rosterMembers.displayName,
        status: rosterMembers.linkStatus,
        createdAt: rosterMembers.createdAt,
      })
      .from(rosterMembers)
      .innerJoin(persons, eq(persons.id, rosterMembers.personId))
      .innerJoin(workspaces, eq(workspaces.id, rosterMembers.workspaceId))
      .where(
        and(
          eq(persons.userId, userId),
          inArray(rosterMembers.linkStatus, [...WAITING]),
          eq(rosterMembers.status, 'ACTIVE'),
        ),
      )
      .orderBy(rosterMembers.createdAt);
    return rows.map((r) => ({
      rosterMemberId: r.rosterMemberId,
      workspaceName: r.workspaceName,
      nameUsed: r.nameUsed,
      state: r.status === 'AWAITING_APPROVAL' ? 'AWAITING_APPROVAL' : 'INVITED',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * "That's me." An invitation to an existing account links immediately; a claim made by
   * signing up with an invited number still needs a workspace admin (ADR 0025).
   */
  async accept(userId: string, rosterMemberId: string): Promise<MyRosterLink[]> {
    await this.db.transaction(async (tx) => {
      const member = await this.lockMine(tx, userId, rosterMemberId);
      if (member.linkStatus === 'AWAITING_APPROVAL') return;
      const next = member.linkStatus === 'PENDING_CONSENT' ? 'LINKED' : 'AWAITING_APPROVAL';
      await tx
        .update(rosterMembers)
        .set({ linkStatus: next })
        .where(eq(rosterMembers.id, rosterMemberId));
      await this.audit.record(
        {
          action: 'roster.link_accepted',
          entityType: 'roster_member',
          entityId: rosterMemberId,
          workspaceId: member.workspaceId,
          actorUserId: userId,
          metadata: { result: next },
        },
        tx,
      );
    });
    return this.listMine(userId);
  }

  /** "That's not me." The workspace keeps its roster entry, unlinked from this account. */
  async decline(userId: string, rosterMemberId: string): Promise<MyRosterLink[]> {
    await this.db.transaction(async (tx) => {
      const member = await this.lockMine(tx, userId, rosterMemberId);
      await tx
        .update(rosterMembers)
        .set({ linkStatus: 'NONE', personId: null })
        .where(eq(rosterMembers.id, rosterMemberId));
      await this.audit.record(
        {
          action: 'roster.link_declined',
          entityType: 'roster_member',
          entityId: rosterMemberId,
          workspaceId: member.workspaceId,
          actorUserId: userId,
        },
        tx,
      );
    });
    return this.listMine(userId);
  }

  private async lockMine(tx: Transaction, userId: string, rosterMemberId: string) {
    const [row] = await tx
      .select({ member: rosterMembers })
      .from(rosterMembers)
      .innerJoin(persons, eq(persons.id, rosterMembers.personId))
      .where(
        and(
          eq(rosterMembers.id, rosterMemberId),
          eq(persons.userId, userId),
          inArray(rosterMembers.linkStatus, [...WAITING]),
          eq(rosterMembers.status, 'ACTIVE'),
        ),
      )
      .for('update', { of: rosterMembers });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found.');
    return row.member;
  }
}
