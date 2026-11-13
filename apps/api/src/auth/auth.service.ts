import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApiError } from '../common/api-error';
import { generateRecoveryCode, normalizeRecoveryCode } from '../common/crypto';
import { AuditService } from '../audit/audit.service';
import { DB, type Database } from '../database/database.module';
import { phoneIdentities, users, workspaceMemberships, workspaces } from '../database/schema';
import { isUniqueViolation } from '../database/types';
import { PasswordService } from './password.service';
import { type DeviceInfo, type IssuedSession, SessionService } from './session.service';

export interface SignedIn {
  user: { id: string; displayName: string };
  session: IssuedSession;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const PHONE_TAKEN = () =>
  new ApiError(409, 'CONFLICT', 'This phone number is already registered.', [
    { field: 'phone', code: 'PHONE_TAKEN' },
  ]);
const INVALID_CREDENTIALS = () =>
  new ApiError(401, 'UNAUTHENTICATED', 'Phone number or password is incorrect.', [
    { field: 'credentials', code: 'INVALID_CREDENTIALS' },
  ]);
const INVALID_RECOVERY = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'Phone number or recovery code is incorrect.', [
    { field: 'recoveryCode', code: 'INVALID_RECOVERY_CODE' },
  ]);
const LOCKED = () =>
  new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the account, its personal workspace and a first session in one transaction.
   * Numbers aren't OTP-verified for now, so uniqueness is the only phone check (ADR 0025).
   */
  async register(input: {
    phone: string;
    password: string;
    displayName: string;
    device: DeviceInfo;
  }): Promise<SignedIn & { recoveryCode: string }> {
    const recoveryCode = generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      this.passwords.hash(input.password),
      this.passwords.hash(normalizeRecoveryCode(recoveryCode)),
    ]);

    try {
      return await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(phoneIdentities)
          .where(eq(phoneIdentities.phoneE164, input.phone))
          .for('update');

        let phoneIdentityId: string;
        if (existing) {
          const [owner] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.phoneIdentityId, existing.id));
          if (owner || existing.status === 'DISABLED') throw PHONE_TAKEN();
          // An invited (pending) number becomes this account's identity; claims are confirmed later (ADR 0013).
          await tx
            .update(phoneIdentities)
            .set({ status: 'REGISTERED' })
            .where(eq(phoneIdentities.id, existing.id));
          phoneIdentityId = existing.id;
        } else {
          const [created] = await tx
            .insert(phoneIdentities)
            .values({ phoneE164: input.phone, status: 'REGISTERED' })
            .returning({ id: phoneIdentities.id });
          phoneIdentityId = created!.id;
        }

        const [user] = await tx
          .insert(users)
          .values({
            phoneIdentityId,
            passwordHash,
            recoveryCodeHash,
            displayName: input.displayName,
            adultConfirmedAt: new Date(),
          })
          .returning({ id: users.id, displayName: users.displayName });

        const [workspace] = await tx
          .insert(workspaces)
          .values({ type: 'PERSONAL', name: 'Personal', createdByUserId: user!.id })
          .returning({ id: workspaces.id });
        await tx
          .insert(workspaceMemberships)
          .values({ workspaceId: workspace!.id, userId: user!.id, role: 'OWNER' });

        const deviceInstallationId = await this.sessions.upsertDevice(user!.id, input.device, tx);
        const session = await this.sessions.create(user!.id, deviceInstallationId, tx);
        await this.audit.record(
          {
            action: 'user.registered',
            entityType: 'user',
            entityId: user!.id,
            actorUserId: user!.id,
          },
          tx,
        );
        return { user: user!, session, recoveryCode };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw PHONE_TAKEN();
      throw error;
    }
  }

  async login(input: { phone: string; password: string; device: DeviceInfo }): Promise<SignedIn> {
    const user = await this.findByPhone(input.phone);
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw LOCKED();

    const valid = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || !valid || user.status !== 'ACTIVE') {
      if (user) await this.recordFailure(user.id, user.failedLoginCount);
      throw INVALID_CREDENTIALS();
    }

    return this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      const deviceInstallationId = await this.sessions.upsertDevice(user.id, input.device, tx);
      const session = await this.sessions.create(user.id, deviceInstallationId, tx);
      return { user: { id: user.id, displayName: user.displayName }, session };
    });
  }

  async refresh(refreshToken: string): Promise<SignedIn> {
    const result = await this.sessions.rotate(refreshToken);
    if (result.status === 'invalid') {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.');
    }
    const [user] = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, result.userId));
    return { user: user!, session: result.session };
  }

  /** Recovery without phone verification: the one-time code replaces SMS (ADR 0025). */
  async resetPassword(input: {
    phone: string;
    recoveryCode: string;
    newPassword: string;
  }): Promise<{ recoveryCode: string }> {
    const user = await this.findByPhone(input.phone);
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw LOCKED();

    const valid = await this.passwords.verify(user?.recoveryCodeHash, input.recoveryCode);
    if (!user || !valid || user.status !== 'ACTIVE') {
      if (user) await this.recordFailure(user.id, user.failedLoginCount);
      throw INVALID_RECOVERY();
    }

    const recoveryCode = generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      this.passwords.hash(input.newPassword),
      this.passwords.hash(normalizeRecoveryCode(recoveryCode)),
    ]);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, recoveryCodeHash, failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      await this.sessions.revokeAllForUser(user.id, 'PASSWORD_RESET', tx);
      await this.audit.record(
        {
          action: 'user.password_reset',
          entityType: 'user',
          entityId: user.id,
          actorUserId: user.id,
        },
        tx,
      );
    });
    return { recoveryCode };
  }

  private async findByPhone(phone: string) {
    const [row] = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(phoneIdentities, eq(users.phoneIdentityId, phoneIdentities.id))
      .where(eq(phoneIdentities.phoneE164, phone));
    return row?.user;
  }

  private async recordFailure(userId: string, previousFailures: number): Promise<void> {
    const failures = previousFailures + 1;
    const lock = failures >= MAX_FAILED_ATTEMPTS;
    await this.db
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : failures,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      })
      .where(eq(users.id, userId));
  }
}
