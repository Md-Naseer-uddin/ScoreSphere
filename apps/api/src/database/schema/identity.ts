import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';

/** Phone numbers are not OTP-verified for now; `verified_at` stays null (ADR 0025). */
export const phoneIdentityStatus = pgEnum('phone_identity_status', [
  'REGISTERED',
  'INVITED',
  'DISABLED',
]);
export const userStatus = pgEnum('user_status', [
  'ACTIVE',
  'LOCKED',
  'DISABLED',
  'DELETION_PENDING',
  /** Anonymised at the user's request; kept only so organisations' records stay intact. */
  'DELETED',
]);
export const clientPlatform = pgEnum('client_platform', ['WEB', 'ANDROID']);

export const phoneIdentities = pgTable('phone_identities', {
  id: id(),
  phoneE164: varchar('phone_e164', { length: 16 }).notNull().unique(),
  status: phoneIdentityStatus('status').notNull(),
  verifiedAt: tstz('verified_at'),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    /** Null only for deleted accounts, whose number is erased and free to register again. */
    phoneIdentityId: uuid('phone_identity_id')
      .unique()
      .references(() => phoneIdentities.id, { onDelete: 'restrict' }),
    passwordHash: text('password_hash').notNull(),
    recoveryCodeHash: text('recovery_code_hash').notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    fullName: varchar('full_name', { length: 150 }),
    /** Stored lower-cased; optional and never a login key. */
    email: varchar('email', { length: 254 }),
    emailVerifiedAt: tstz('email_verified_at'),
    avatarKey: text('avatar_key'),
    bio: varchar('bio', { length: 500 }),
    city: varchar('city', { length: 100 }),
    locale: varchar('locale', { length: 20 }).notNull().default('en'),
    status: userStatus('status').notNull().default('ACTIVE'),
    discoverableByPhone: boolean('discoverable_by_phone').notNull().default(false),
    /** When the user confirmed they are 18 or older (ADR 0026). */
    adultConfirmedAt: tstz('adult_confirmed_at').notNull(),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: tstz('locked_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_unique')
      .on(t.email)
      .where(sql`${t.email} is not null`),
  ],
);

export const deviceInstallations = pgTable(
  'device_installations',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The client's own installation ID (UUIDv7 from the device's local DB). */
    devicePublicId: uuid('device_public_id').notNull(),
    platform: clientPlatform('platform').notNull(),
    appVersion: varchar('app_version', { length: 32 }),
    lastSeenAt: tstz('last_seen_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('device_installations_user_device_unique').on(t.userId, t.devicePublicId)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All rotations of one login share a family; reuse of a rotated token revokes the family. */
    familyId: uuid('family_id').notNull(),
    deviceInstallationId: uuid('device_installation_id').references(() => deviceInstallations.id, {
      onDelete: 'set null',
    }),
    /** SHA-256 hex of the opaque refresh token. */
    refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    rotatedAt: tstz('rotated_at'),
    revokedAt: tstz('revoked_at'),
    revokedReason: varchar('revoked_reason', { length: 32 }),
    lastUsedAt: tstz('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_sessions_family_idx').on(t.familyId),
    index('auth_sessions_user_idx').on(t.userId),
  ],
);
