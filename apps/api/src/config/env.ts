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
  /** Reverse proxies in front of the API, so rate limits see the client's real IP. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Bearer token for GET /metrics; the endpoint is hidden without it. */
  METRICS_TOKEN: z.string().min(24).optional(),
  /** Where unexpected errors are reported (scrubbed JSON); only logged without it. */
  ERROR_WEBHOOK_URL: z.url().optional(),
  /** Oldest app version that may start new matches (ADR 0019). */
  MIN_CLIENT_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .default('0.0.0'),
  LATEST_CLIENT_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  /** The signed APK of the latest release, and its SHA-256, for the download page. */
  APK_URL: z.url().optional(),
  APK_SHA256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  RELEASE_NOTES_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Settings that are fine in development but unsafe in production. */
function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.CORS_ORIGINS.length === 0) problems.push('CORS_ORIGINS: list the web app origins');
  if (!env.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED: must be true');
  if (!env.PUBLIC_APP_URL.startsWith('https://')) problems.push('PUBLIC_APP_URL: must use https');
  return problems;
}

/** Parses and validates the environment once at startup; fails fast with every problem listed. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const problems = productionProblems(parsed.data);
  if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.join('\n')}`);
  return parsed.data;
}
