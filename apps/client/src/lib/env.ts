import { z } from 'zod';

const schema = z.object({
  /** Relative in the browser (dev server proxies /api); absolute for the Android app. */
  VITE_API_URL: z.string().min(1).default('/api/v1'),
});

const parsed = schema.parse(import.meta.env);

export const env = { apiUrl: parsed.VITE_API_URL.replace(/\/$/, '') };
