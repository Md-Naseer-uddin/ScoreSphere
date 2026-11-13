import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@scoresphere/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { authSessions, deviceInstallations, users } from '../database/schema';
import type { DbExecutor } from '../database/types';

export interface DeviceInfo {
  deviceId: string;
  platform: 'WEB' | 'ANDROID';
  appVersion?: string | undefined;
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type RotationResult =
  { status: 'rotated'; userId: string; session: IssuedSession } | { status: 'invalid' };

/** A rotated token presented again within this window is treated as a benign race, not theft. */
const REUSE_GRACE_MS = 30_000;

/**
 * Refresh sessions: opaque rotating tokens stored as SHA-256 hashes (ADR 0020).
 * Presenting an already-rotated token outside the grace window revokes the whole family.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Records the installation the user signs in from; reactivates it if previously revoked. */
  async upsertDevice(
    userId: string,
    device: DeviceInfo,
    executor: DbExecutor = this.db,
  ): Promise<string> {
    const [row] = await executor
      .insert(deviceInstallations)
      .values({
        userId,
        devicePublicId: device.deviceId,
        platform: device.platform,
        appVersion: device.appVersion ?? null,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [deviceInstallations.userId, deviceInstallations.devicePublicId],
        set: {
          platform: device.platform,
          appVersion: device.appVersion ?? null,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
      })
      .returning({ id: deviceInstallations.id });
    return row!.id;
  }

  async create(
    userId: string,
    deviceInstallationId: string | null,
    executor: DbExecutor = this.db,
    familyId: string = newId(),
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const refreshExpiresAt = this.refreshExpiry();
    const [row] = await executor
      .insert(authSessions)
      .values({
        userId,
        familyId,
        deviceInstallationId,
        refreshTokenHash: sha256Hex(refreshToken),
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
      })
      .returning({ id: authSessions.id });
    return { sessionId: row!.id, refreshToken, refreshExpiresAt };
  }

  async rotate(refreshToken: string): Promise<RotationResult> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(authSessions)
        .where(eq(authSessions.refreshTokenHash, sha256Hex(refreshToken)))
        .for('update');
      if (!session || session.revokedAt) return { status: 'invalid' };

      if (session.rotatedAt) {
        if (Date.now() - session.rotatedAt.getTime() > REUSE_GRACE_MS) {
          await this.revokeFamily(session.familyId, 'REUSE_DETECTED', tx);
        }
        return { status: 'invalid' };
      }
      if (session.expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

      const [user] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, session.userId));
      if (user?.status !== 'ACTIVE') return { status: 'invalid' };

      await tx
        .update(authSessions)
        .set({ rotatedAt: new Date() })
        .where(eq(authSessions.id, session.id));
      const next = await this.create(
        session.userId,
        session.deviceInstallationId,
        tx,
        session.familyId,
      );
      return { status: 'rotated', userId: session.userId, session: next };
    });
  }

  /** Access tokens stay valid only while their session family is unrevoked and the user active. */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: authSessions.id })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          eq(users.status, 'ACTIVE'),
        ),
      );
    return Boolean(row);
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const [session] = await this.db
      .select({ familyId: authSessions.familyId })
      .from(authSessions)
      .where(eq(authSessions.refreshTokenHash, sha256Hex(refreshToken)));
    if (session) await this.revokeFamily(session.familyId, 'LOGOUT');
  }

  async revokeBySessionId(sessionId: string, reason: string): Promise<void> {
    const [session] = await this.db
      .select({ familyId: authSessions.familyId })
      .from(authSessions)
      .where(eq(authSessions.id, sessionId));
    if (session) await this.revokeFamily(session.familyId, reason);
  }

  async revokeFamily(
    familyId: string,
    reason: string,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor
      .update(authSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(authSessions.familyId, familyId), isNull(authSessions.revokedAt)));
  }

  /** Signs the user out everywhere, optionally keeping the session family of `exceptSessionId`. */
  async revokeAllForUser(
    userId: string,
    reason: string,
    executor: DbExecutor = this.db,
    exceptSessionId?: string,
  ): Promise<void> {
    let keepFamily: string | undefined;
    if (exceptSessionId) {
      const [current] = await executor
        .select({ familyId: authSessions.familyId })
        .from(authSessions)
        .where(eq(authSessions.id, exceptSessionId));
      keepFamily = current?.familyId;
    }
    const sessions = await executor
      .select({ familyId: authSessions.familyId })
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
    for (const familyId of new Set(sessions.map((s) => s.familyId))) {
      if (familyId !== keepFamily) await this.revokeFamily(familyId, reason, executor);
    }
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
}
