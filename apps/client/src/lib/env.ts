import { z } from 'zod';

/** An empty value means "not set", so CI can pass variables that may not exist yet. */
const unset = (value: unknown) => (value === '' ? undefined : value);

const schema = z.object({
  /** Relative in the browser (dev server proxies /api); absolute for the Android app. */
  VITE_API_URL: z.preprocess(unset, z.string().min(1).default('/api/v1')),
  /** Public web address used in shareable links; the Android app must set it explicitly. */
  VITE_PUBLIC_APP_URL: z.preprocess(unset, z.url().optional()),
});

export function parseClientEnv(source: Record<string, unknown>) {
  const parsed = schema.parse(source);
  return {
    apiUrl: parsed.VITE_API_URL.replace(/\/$/, ''),
    publicAppUrl: (parsed.VITE_PUBLIC_APP_URL ?? globalThis.location?.origin ?? '').replace(
      /\/$/,
      '',
    ),
  };
}

export const env = parseClientEnv(import.meta.env);
