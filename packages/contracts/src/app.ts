import { z } from 'zod';

const semver = z.string().regex(/^\d+\.\d+\.\d+$/);

/** Release information for update prompts and the download page (ADR 0019). */
export const appVersionInfoSchema = z.object({
  minClientVersion: semver,
  latestVersion: semver.nullable(),
  apk: z.object({ url: z.url(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).nullable(),
  releaseNotesUrl: z.url().nullable(),
});
export type AppVersionInfo = z.infer<typeof appVersionInfoSchema>;

/** Compares "1.2.3" versions: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
