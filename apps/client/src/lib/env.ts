import { z } from 'zod';

const schema = z.object({
  /** Relative in the browser (dev server proxies /api); absolute for the Android app. */
  VITE_API_URL: z.string().min(1).default('/api/v1'),
  /** Public web address used in shareable links; the Android app must set it explicitly. */
  VITE_PUBLIC_APP_URL: z.url().optional(),
});

const parsed = schema.parse(import.meta.env);

export const env = {
  apiUrl: parsed.VITE_API_URL.replace(/\/$/, ''),
  publicAppUrl: (parsed.VITE_PUBLIC_APP_URL ?? globalThis.location?.origin ?? '').replace(
    /\/$/,
    '',
  ),
};
