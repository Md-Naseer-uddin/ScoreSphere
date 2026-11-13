import { Inject, Injectable } from '@nestjs/common';
import { type Device, maskPhone, type Me, type UpdateMeRequest } from '@scoresphere/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { generateRecoveryCode, normalizeRecoveryCode } from '../common/crypto';
import { DB, type Database } from '../database/database.module';
import { authSessions, deviceInstallations, phoneIdentities, users } from '../database/schema';
import { isUniqueViolation } from '../database/types';

const WRONG_PASSWORD = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'Current password is incorrect.', [
    { field: 'currentPassword', code: 'WRONG_PASSWORD' },
  ]);
const PHONE_TAKEN = () =>
  new ApiError(409, 'CONFLICT', 'This phone number is already registered.', [
    { field: 'newPhone', code: 'PHONE_TAKEN' },
  ]);

/** Public URL path for a stored media key; clients prefix it with the API base URL. */
export function mediaPath(key: string | null): string | null {
  return key ? `/media/${key}` : null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<Me> {
    const [row] = await this.db
      .select({ user: users, phone: phoneIdentities.phoneE164 })
      .from(users)
      .innerJoin(phoneIdentities, eq(users.phoneIdentityId, phoneIdentities.id))
      .where(eq(users.id, userId));
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
    const { user, phone } = row;
    return {
      id: user.id,
      displayName: user.displayName,
      fullName: user.fullName,
      phoneMasked: maskPhone(phone),
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      avatarUrl: mediaPath(user.avatarKey),
      bio: user.bio,
      city: user.city,
      locale: user.locale,
      discoverableByPhone: user.discoverableByPhone,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateMe(userId: string, patch: UpdateMeRequest): Promise<Me> {
    const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length > 0) {
      await this.db.update(users).set(values).where(eq(users.id, userId));
    }
    return this.getMe(userId);
  }

  /** Changing the password signs out every other session. */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.requirePassword(userId, currentPassword);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
      await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED', tx, sessionId);
      await this.audit.record(
        {
          action: 'user.password_changed',
          entityType: 'user',
          entityId: userId,
          actorUserId: userId,
        },
        tx,
      );
    });
  }

  /**
   * Moves the account to a new number, keeping the same phone identity row so every
   * link to it survives. The new number must be unused (ADR 0025: no OTP yet).
   */
  async changePhone(userId: string, currentPassword: string, newPhone: string): Promise<Me> {
    const user = await this.requirePassword(userId, currentPassword);
    try {
      await this.db.transaction(async (tx) => {
        const [taken] = await tx
          .select({ id: phoneIdentities.id })
          .from(phoneIdentities)
          .where(eq(phoneIdentities.phoneE164, newPhone));
        if (taken && taken.id !== user.phoneIdentityId) throw PHONE_TAKEN();
        await tx
          .update(phoneIdentities)
          .set({ phoneE164: newPhone })
          .where(eq(phoneIdentities.id, user.phoneIdentityId));
        await this.audit.record(
          {
            action: 'user.phone_changed',
            entityType: 'user',
            entityId: userId,
            actorUserId: userId,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw PHONE_TAKEN();
      throw error;
    }
    return this.getMe(userId);
  }

  async regenerateRecoveryCode(
    userId: string,
    currentPassword: string,
  ): Promise<{ recoveryCode: string }> {
    await this.requirePassword(userId, currentPassword);
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await this.passwords.hash(normalizeRecoveryCode(recoveryCode));
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ recoveryCodeHash }).where(eq(users.id, userId));
      await this.audit.record(
        {
          action: 'user.recovery_code_regenerated',
          entityType: 'user',
          entityId: userId,
          actorUserId: userId,
        },
        tx,
      );
    });
    return { recoveryCode };
  }

  async listDevices(userId: string, sessionId: string): Promise<Device[]> {
    const [current] = await this.db
      .select({ deviceId: authSessions.deviceInstallationId })
      .from(authSessions)
      .where(eq(authSessions.id, sessionId));
    const rows = await this.db
      .select()
      .from(deviceInstallations)
      .where(and(eq(deviceInstallations.userId, userId), isNull(deviceInstallations.revokedAt)))
      .orderBy(desc(deviceInstallations.lastSeenAt));
    return rows.map((d) => ({
      id: d.id,
      platform: d.platform,
      appVersion: d.appVersion,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      current: d.id === current?.deviceId,
    }));
  }

  /** Signs a device out: revokes the installation and every session started on it. */
  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [device] = await tx
        .update(deviceInstallations)
        .set({ revokedAt: new Date() })
        .where(and(eq(deviceInstallations.id, deviceId), eq(deviceInstallations.userId, userId)))
        .returning({ id: deviceInstallations.id });
      if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found.');
      const sessions = await tx
        .select({ familyId: authSessions.familyId })
        .from(authSessions)
        .where(
          and(eq(authSessions.deviceInstallationId, deviceId), isNull(authSessions.revokedAt)),
        );
      for (const familyId of new Set(sessions.map((s) => s.familyId))) {
        await this.sessions.revokeFamily(familyId, 'DEVICE_REVOKED', tx);
      }
      await this.audit.record(
        {
          action: 'user.device_revoked',
          entityType: 'device',
          entityId: deviceId,
          actorUserId: userId,
        },
        tx,
      );
    });
  }

  private async requirePassword(userId: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user || !(await this.passwords.verify(user.passwordHash, password)))
      throw WRONG_PASSWORD();
    return user;
  }
}
