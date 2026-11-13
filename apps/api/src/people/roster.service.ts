import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRosterMemberRequest,
  LookupResult,
  RosterMember,
  UpdateRosterMemberRequest,
} from '@scoresphere/contracts';
import { and, eq, isNull, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import {
  persons,
  phoneIdentities,
  rosterMembers,
  teamMemberships,
  users,
} from '../database/schema';
import { type DbExecutor, isUniqueViolation, type Transaction } from '../database/types';
import { mediaPath } from '../users/users.service';
import type { WorkspaceContext } from '../workspaces/workspace-access';
import { PersonsService } from './persons.service';
import { selectRosterMembers } from './roster-mapper';

type LinkStatus = (typeof rosterMembers.$inferSelect)['linkStatus'];
type LinkTarget = { personId?: string | undefined; phone?: string | undefined };

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Roster member not found.');
const ALREADY_ON_ROSTER = () =>
  new ApiError(409, 'CONFLICT', 'This person is already on your roster.', [
    { field: 'link', code: 'ALREADY_ON_ROSTER' },
  ]);
const PERSON_NOT_AVAILABLE = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'That person can no longer be added directly.', [
    { field: 'link', code: 'PERSON_NOT_AVAILABLE' },
  ]);

@Injectable()
export class RosterService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly persons: PersonsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Exact-phone lookup (ADR 0012). Only accounts that opted into discovery (or the caller)
   * are revealed; private accounts and unknown numbers both return INVITE.
   */
  async lookup(ctx: WorkspaceContext, phone: string): Promise<LookupResult> {
    const [row] = await this.db
      .select({
        userId: users.id,
        userStatus: users.status,
        discoverable: users.discoverableByPhone,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        personId: persons.id,
      })
      .from(phoneIdentities)
      .leftJoin(users, eq(users.phoneIdentityId, phoneIdentities.id))
      .leftJoin(persons, eq(persons.phoneIdentityId, phoneIdentities.id))
      .where(eq(phoneIdentities.phoneE164, phone));
    if (!row) return { result: 'INVITE' };

    if (row.personId) {
      const [onRoster] = await this.db
        .select({ id: rosterMembers.id })
        .from(rosterMembers)
        .where(
          and(
            eq(rosterMembers.workspaceId, ctx.workspaceId),
            eq(rosterMembers.personId, row.personId),
            eq(rosterMembers.status, 'ACTIVE'),
          ),
        );
      if (onRoster) return { result: 'ON_ROSTER', rosterMemberId: onRoster.id };
    }

    if (
      row.userId &&
      row.userStatus === 'ACTIVE' &&
      (row.discoverable || row.userId === ctx.userId)
    ) {
      const personId = row.personId ?? (await this.persons.ensureForUser(row.userId));
      return {
        result: 'DISCOVERABLE',
        person: {
          id: personId,
          displayName: row.displayName!,
          avatarUrl: mediaPath(row.avatarKey),
        },
      };
    }
    return { result: 'INVITE' };
  }

  list(ctx: WorkspaceContext, includeArchived = false): Promise<RosterMember[]> {
    return selectRosterMembers(
      this.db,
      and(
        eq(rosterMembers.workspaceId, ctx.workspaceId),
        includeArchived ? undefined : eq(rosterMembers.status, 'ACTIVE'),
      ),
    );
  }

  async get(
    ctx: WorkspaceContext,
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<RosterMember> {
    const [member] = await selectRosterMembers(
      executor,
      and(eq(rosterMembers.id, id), eq(rosterMembers.workspaceId, ctx.workspaceId)),
    );
    if (!member) throw NOT_FOUND();
    return member;
  }

  async create(ctx: WorkspaceContext, input: CreateRosterMemberRequest): Promise<RosterMember> {
    try {
      return await this.db.transaction(async (tx) => {
        const link = input.link ? await this.resolveLink(tx, ctx, input.link) : null;
        const [row] = await tx
          .insert(rosterMembers)
          .values({
            workspaceId: ctx.workspaceId,
            displayName: input.displayName,
            jerseyNumber: input.jerseyNumber ?? null,
            personId: link?.personId ?? null,
            linkStatus: link?.status ?? 'NONE',
            createdByUserId: ctx.userId,
          })
          .returning({ id: rosterMembers.id });
        await this.audit.record(
          {
            action: 'roster.member_added',
            entityType: 'roster_member',
            entityId: row!.id,
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            metadata: { link: link ? link.status : 'NONE' },
          },
          tx,
        );
        return this.get(ctx, row!.id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'roster_members_workspace_person_unique'))
        throw ALREADY_ON_ROSTER();
      throw error;
    }
  }

  async update(
    ctx: WorkspaceContext,
    id: string,
    patch: UpdateRosterMemberRequest,
  ): Promise<RosterMember> {
    const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length > 0) {
      const [row] = await this.db
        .update(rosterMembers)
        .set(values)
        .where(and(eq(rosterMembers.id, id), eq(rosterMembers.workspaceId, ctx.workspaceId)))
        .returning({ id: rosterMembers.id });
      if (!row) throw NOT_FOUND();
    }
    return this.get(ctx, id);
  }

  /** Links an existing roster-only member to a person, e.g. once their number is known. */
  async link(ctx: WorkspaceContext, id: string, target: LinkTarget): Promise<RosterMember> {
    try {
      return await this.db.transaction(async (tx) => {
        const member = await this.lockMember(tx, ctx, id);
        if (member.linkStatus !== 'NONE') {
          throw new ApiError(409, 'CONFLICT', 'This roster member is already linked.', [
            { field: 'link', code: 'ALREADY_LINKED' },
          ]);
        }
        const link = await this.resolveLink(tx, ctx, target);
        await tx
          .update(rosterMembers)
          .set({ personId: link.personId, linkStatus: link.status })
          .where(eq(rosterMembers.id, id));
        await this.recordLink(tx, ctx, id, 'roster.member_linked', { link: link.status });
        return this.get(ctx, id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'roster_members_workspace_person_unique'))
        throw ALREADY_ON_ROSTER();
      throw error;
    }
  }

  /** While numbers are unverified, a claim needs an admin's approval (ADR 0025). */
  async decideClaim(ctx: WorkspaceContext, id: string, approve: boolean): Promise<RosterMember> {
    return this.db.transaction(async (tx) => {
      const member = await this.lockMember(tx, ctx, id);
      if (member.linkStatus !== 'AWAITING_APPROVAL') {
        throw new ApiError(409, 'CONFLICT', 'There is no claim to review.', [
          { field: 'link', code: 'NO_PENDING_CLAIM' },
        ]);
      }
      await tx
        .update(rosterMembers)
        .set(approve ? { linkStatus: 'LINKED' } : { linkStatus: 'NONE', personId: null })
        .where(eq(rosterMembers.id, id));
      await this.recordLink(
        tx,
        ctx,
        id,
        approve ? 'roster.claim_approved' : 'roster.claim_rejected',
      );
      return this.get(ctx, id, tx);
    });
  }

  /** Archives a member and takes them off every team; past matches keep their snapshots. */
  async archive(ctx: WorkspaceContext, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(rosterMembers)
        .set({ status: 'ARCHIVED' })
        .where(and(eq(rosterMembers.id, id), eq(rosterMembers.workspaceId, ctx.workspaceId)))
        .returning({ id: rosterMembers.id });
      if (!row) throw NOT_FOUND();
      await tx
        .update(teamMemberships)
        .set({ leftAt: new Date() })
        .where(and(eq(teamMemberships.rosterMemberId, id), isNull(teamMemberships.leftAt)));
      await this.recordLink(tx, ctx, id, 'roster.member_archived');
    });
  }

  /** Decides how a new link starts: linked straight away, or waiting on the person. */
  private async resolveLink(
    tx: Transaction,
    ctx: WorkspaceContext,
    target: LinkTarget,
  ): Promise<{ personId: string; status: LinkStatus }> {
    if (target.personId) {
      const [person] = await tx
        .select({ id: persons.id })
        .from(persons)
        .innerJoin(users, eq(users.id, persons.userId))
        .where(
          and(
            eq(persons.id, target.personId),
            eq(users.status, 'ACTIVE'),
            or(eq(users.discoverableByPhone, true), eq(users.id, ctx.userId)),
          ),
        );
      if (!person) throw PERSON_NOT_AVAILABLE();
      return { personId: person.id, status: 'LINKED' };
    }

    const [account] = await tx
      .select({ userId: users.id, discoverable: users.discoverableByPhone })
      .from(phoneIdentities)
      .innerJoin(users, eq(users.phoneIdentityId, phoneIdentities.id))
      .where(eq(phoneIdentities.phoneE164, target.phone!));
    if (account) {
      const personId = await this.persons.ensureForUser(account.userId, tx);
      const direct = account.discoverable || account.userId === ctx.userId;
      return { personId, status: direct ? 'LINKED' : 'PENDING_CONSENT' };
    }
    return {
      personId: await this.persons.ensurePendingForPhone(target.phone!, tx),
      status: 'PENDING_CLAIM',
    };
  }

  private async lockMember(tx: Transaction, ctx: WorkspaceContext, id: string) {
    const [member] = await tx
      .select()
      .from(rosterMembers)
      .where(
        and(
          eq(rosterMembers.id, id),
          eq(rosterMembers.workspaceId, ctx.workspaceId),
          eq(rosterMembers.status, 'ACTIVE'),
        ),
      )
      .for('update');
    if (!member) throw NOT_FOUND();
    return member;
  }

  private recordLink(
    tx: Transaction,
    ctx: WorkspaceContext,
    id: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        action,
        entityType: 'roster_member',
        entityId: id,
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        ...(metadata ? { metadata } : {}),
      },
      tx,
    );
  }
}
