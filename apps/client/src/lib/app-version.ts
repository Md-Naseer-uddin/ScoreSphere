import { type AppVersionInfo, appVersionInfoSchema, compareVersions } from '@scoresphere/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { db } from './db';
import { APP_VERSION } from './platform';

const KEY = 'appVersionInfo';

/** Release info from the server; the last answer is kept on the device for offline use. */
async function fetchVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const info = await apiFetch('/app/version', { auth: false }, appVersionInfoSchema);
    await db.settings.put({ key: KEY, value: info }).catch(() => undefined);
    return info;
  } catch {
    const cached = await db.settings.get(KEY).catch(() => undefined);
    const parsed = appVersionInfoSchema.safeParse(cached?.value);
    return parsed.success ? parsed.data : null;
  }
}

export function useAppVersionInfo() {
  return useQuery({ queryKey: ['app-version'], queryFn: fetchVersionInfo, staleTime: 60 * 60_000 });
}

/** True when this build is older than the oldest version allowed to start matches (ADR 0019). */
export function isBelowMinimum(
  info: AppVersionInfo | null | undefined,
  version = APP_VERSION,
): boolean {
  return Boolean(info && compareVersions(version, info.minClientVersion) < 0);
}

export function isUpdateAvailable(
  info: AppVersionInfo | null | undefined,
  version = APP_VERSION,
): boolean {
  return Boolean(info?.latestVersion && compareVersions(version, info.latestVersion) < 0);
}
