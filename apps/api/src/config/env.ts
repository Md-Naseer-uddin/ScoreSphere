import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  CORS_ORIGINS: csv,
  APP_VERSION: z.string().default('0.0.0'),
  /** HMAC key for access tokens; at least 32 characters. */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_ENABLED: bool,
  /** Local directory for uploaded media until object storage is configured. */
  STORAGE_DIR: z.string().default('.storage'),
  /** Base URL of the web app, used in invitation links. */
  PUBLIC_APP_URL: z.url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates the environment once at startup; fails fast with every problem listed. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
