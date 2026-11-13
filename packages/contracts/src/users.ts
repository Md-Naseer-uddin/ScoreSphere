import { z } from 'zod';
import { displayNameSchema, passwordSchema } from './auth.js';
import { idSchema } from './ids.js';
import { phoneSchema } from './phone.js';

export const meSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  fullName: z.string().nullable(),
  /** Masked for display (e.g. `+91 ••••••3210`); the full number is never sent back. */
  phoneMasked: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  city: z.string().nullable(),
  locale: z.string(),
  discoverableByPhone: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof meSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const updateMeRequestSchema = z.object({
  displayName: displayNameSchema.optional(),
  fullName: optionalText(150),
  bio: optionalText(500),
  city: optionalText(100),
  locale: z.enum(['en']).optional(),
  discoverableByPhone: z.boolean().optional(),
});
export type UpdateMeRequest = z.input<typeof updateMeRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const changePhoneRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPhone: phoneSchema,
});

export const confirmPasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
});

export const deviceSchema = z.object({
  id: idSchema,
  platform: z.string(),
  appVersion: z.string().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  current: z.boolean(),
});
export type Device = z.infer<typeof deviceSchema>;
