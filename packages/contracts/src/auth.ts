import { z } from 'zod';
import { idSchema } from './ids.js';
import { phoneSchema } from './phone.js';

export const passwordSchema = z.string().min(8, 'PASSWORD_TOO_SHORT').max(128, 'PASSWORD_TOO_LONG');
export const displayNameSchema = z.string().trim().min(1).max(100);

export const CLIENT_PLATFORMS = ['WEB', 'ANDROID'] as const;
export const clientPlatformSchema = z.enum(CLIENT_PLATFORMS);
export type ClientPlatform = z.infer<typeof clientPlatformSchema>;

/** The device making the request; links sessions and scoring events to an installation. */
export const deviceInfoSchema = z.object({
  deviceId: idSchema,
  platform: clientPlatformSchema,
  appVersion: z.string().max(32).optional(),
});

/** One-time recovery code: 16 Crockford base32 characters in groups of 4 (ADR 0025). */
export const recoveryCodeSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{16}$/, 'INVALID_RECOVERY_CODE'));

export const registerRequestSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  /** Accounts are 18+ only (ADR 0026). */
  adultConfirmed: z.literal(true),
  device: deviceInfoSchema,
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
  device: deviceInfoSchema,
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

/** Android sends its refresh token in the body; the web sends a cookie instead (ADR 0020). */
export const refreshRequestSchema = z
  .object({ refreshToken: z.string().min(1).optional() })
  // Web clients send no body at all; the cookie carries the token.
  .default({});

export const resetPasswordRequestSchema = z.object({
  phone: phoneSchema,
  recoveryCode: recoveryCodeSchema,
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.input<typeof resetPasswordRequestSchema>;

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  /** Present only for native clients; web clients receive an httpOnly cookie. */
  refreshToken: z.string().optional(),
  user: z.object({ id: idSchema, displayName: z.string() }),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Returned when an account is created or a recovery code is used/regenerated. Shown once. */
export const recoveryCodeResponseSchema = z.object({ recoveryCode: z.string() });

export const registerResponseSchema = sessionResponseSchema.extend({ recoveryCode: z.string() });
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
