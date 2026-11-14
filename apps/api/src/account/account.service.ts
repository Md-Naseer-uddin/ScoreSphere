import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import {
  auditLogs,
  authSessions,
  deviceInstallations,
  matches,
  persons,
  phoneIdentities,
  rosterMembers,
  teamMemberships,
  teams,
  users,
  workspaceMemberships,
  workspaces,
} from '../database/schema';
import { StorageService } from '../media/storage.service';

const WRONG_PASSWORD = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'That password is not right.', [
    { field: 'password', code: 'WRONG_PASSWORD' },
  ]);

/**
 * The data principal's rights under the DPDP Act: a copy of their data, and erasure.
 * Erasure anonymises the account instead of deleting the row, because organisations keep
 * their own records (rosters, matches, audit logs) that point at it.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async export(userId: string) {
    const [user] = await this.db
      .select({ user: users, phone: phoneIdentities.phoneE164 })
      .from(users)
      .leftJoin(phoneIdentities, eq(phoneIdentities.id, users.phoneIdentityId))
      .where(eq(users.id, userId));
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
    const [devices, memberships, links, created, activity] = await Promise.all([
      this.db.select().from(deviceInstallations).where(eq(deviceInstallations.userId, userId)),
      this.db
        .select({
          name: workspaces.name,
          type: workspaces.type,
          role: workspaceMemberships.role,
          joinedAt: workspaceMemberships.joinedAt,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(eq(workspaceMemberships.userId, userId)),
      this.db
        .select({
          workspace: workspaces.name,
          displayName: rosterMembers.displayName,
          link: rosterMembers.linkStatus,
        })
        .from(persons)
        .innerJoin(rosterMembers, eq(rosterMembers.personId, persons.id))
        .innerJoin(workspaces, eq(workspaces.id, rosterMembers.workspaceId))
        .where(eq(persons.userId, userId)),
      this.db
        .select({
          id: matches.id,
          sport: matches.sport,
          title: matches.title,
          status: matches.status,
          createdAt: matches.createdAt,
        })
        .from(matches)
        .where(eq(matches.createdByUserId, userId)),
      this.db
        .select({ action: auditLogs.action, at: auditLogs.createdAt })
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1000),
    ]);
    const u = user.user;
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: u.id,
        phone: user.phone,
        displayName: u.displayName,
        fullName: u.fullName,
        email: u.email,
        bio: u.bio,
        city: u.city,
        locale: u.locale,
        discoverableByPhone: u.discoverableByPhone,
        adultConfirmedAt: u.adultConfirmedAt.toISOString(),
        createdAt: u.createdAt.toISOString(),
      },
      devices: devices.map((d) => ({
        platform: d.platform,
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        revokedAt: d.revokedAt?.toISOString() ?? null,
      })),
      workspaces: memberships.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
      rosterLinks: links,
      matchesCreated: created.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      activity: activity.map((a) => ({ action: a.action, at: a.at.toISOString() })),
    };
  }

  async delete(userId: string, password: string): Promise<void> {
    const avatarKey = await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user || !(await this.passwords.verify(user.passwordHash, password)))
        throw WRONG_PASSWORD();

      // An organisation must not be left without an owner while others still use it.
      const owned = await tx
        .select({ workspaceId: workspaceMemberships.workspaceId, name: workspaces.name })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.role, 'OWNER'),
            eq(workspaceMemberships.status, 'ACTIVE'),
            eq(workspaces.type, 'ORGANIZATION'),
          ),
        );
      for (const org of owned) {
        const others = await tx
          .select({ role: workspaceMemberships.role })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, org.workspaceId),
              ne(workspaceMemberships.userId, userId),
              eq(workspaceMemberships.status, 'ACTIVE'),
            ),
          );
        if (others.length > 0 && !others.some((o) => o.role === 'OWNER')) {
          throw new ApiError(409, 'CONFLICT', `Make someone else an owner of ${org.name} first.`, [
            { field: 'workspace', code: 'LAST_OWNER' },
          ]);
        }
        if (others.length === 0) {
          await tx
            .update(workspaces)
            .set({ archivedAt: new Date() })
            .where(eq(workspaces.id, org.workspaceId));
        }
      }

      await tx.delete(workspaceMemberships).where(eq(workspaceMemberships.userId, userId));
      // The personal workspace and everything in it are the user's own data. Team memberships
      // go first: they hold roster members with RESTRICT, which a cascade would trip over.
      const personal = tx
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(workspaces, eq(workspaces.id, teams.workspaceId))
        .where(and(eq(workspaces.createdByUserId, userId), eq(workspaces.type, 'PERSONAL')));
      await tx.delete(teamMemberships).where(inArray(teamMemberships.teamId, personal));
      await tx
        .delete(workspaces)
        .where(and(eq(workspaces.createdByUserId, userId), eq(workspaces.type, 'PERSONAL')));

      // Organisations keep their roster entries, but no longer linked to this person.
      const [person] = await tx.select().from(persons).where(eq(persons.userId, userId));
      if (person) {
        await tx
          .update(rosterMembers)
          .set({ personId: null, linkStatus: 'NONE' })
          .where(eq(rosterMembers.personId, person.id));
        await tx.delete(persons).where(eq(persons.id, person.id));
      }

      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await tx.delete(deviceInstallations).where(eq(deviceInstallations.userId, userId));
      await tx
        .update(users)
        .set({
          phoneIdentityId: null,
          displayName: 'Deleted user',
          fullName: null,
          email: null,
          emailVerifiedAt: null,
          avatarKey: null,
          bio: null,
          city: null,
          discoverableByPhone: false,
          passwordHash: 'deleted',
          recoveryCodeHash: 'deleted',
          status: 'DELETED',
        })
        .where(eq(users.id, userId));
      // Erase the number itself, so it can be registered afresh (numbers get recycled).
      if (user.phoneIdentityId) {
        await tx.delete(phoneIdentities).where(eq(phoneIdentities.id, user.phoneIdentityId));
      }
      await this.audit.record(
        { action: 'account.deleted', entityType: 'user', entityId: userId, actorUserId: userId },
        tx,
      );
      return user.avatarKey;
    });
    if (avatarKey) await this.storage.delete(avatarKey).catch(() => undefined);
  }
}
