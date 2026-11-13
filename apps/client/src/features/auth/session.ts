import { type SessionResponse, sessionResponseSchema } from '@scoresphere/contracts';
import { create } from 'zustand';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { refreshTokenStore } from './refresh-token-store';

/** How long a device may keep scoring offline since its last successful sign-in check (plan §7). */
export const OFFLINE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const LAST_USER_KEY = 'lastSessionUser';

interface RememberedUser {
  user: SessionUser;
  /** When the server last confirmed this session, epoch ms. */
  confirmedAt: number;
}

async function rememberUser(user: SessionUser): Promise<void> {
  const value: RememberedUser = { user, confirmedAt: Date.now() };
  await db.settings.put({ key: LAST_USER_KEY, value }).catch(() => undefined);
}

/** The account last signed in on this device, if it is still inside the offline window. */
async function rememberedUser(): Promise<SessionUser | null> {
  const row = await db.settings.get(LAST_USER_KEY).catch(() => undefined);
  const value = row?.value as RememberedUser | undefined;
  if (!value || Date.now() - value.confirmedAt > OFFLINE_WINDOW_MS) return null;
  return value.user;
}

/**
 * `loading` until the first refresh attempt settles; `offline` when that attempt couldn't
 * reach the server. Offline with a `user` means the device may keep working with that
 * account's local data until it reconnects (offline scoring); without one it can't.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'offline';

export interface SessionUser {
  id: string;
  displayName: string;
}

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: SessionUser | null;
}

/** The access token lives only in memory (ADR 0020). */
export const useSession = create<SessionState>(() => ({
  status: 'loading',
  accessToken: null,
  user: null,
}));

export function getAccessToken(): string | null {
  return useSession.getState().accessToken;
}

export async function applySession(session: SessionResponse): Promise<void> {
  if (session.refreshToken) await refreshTokenStore.set(session.refreshToken);
  useSession.setState({
    status: 'authenticated',
    accessToken: session.accessToken,
    user: session.user,
  });
  await rememberUser(session.user);
}

export async function clearSession(): Promise<void> {
  await refreshTokenStore.clear();
  await db.settings.delete(LAST_USER_KEY).catch(() => undefined);
  useSession.setState({ status: 'anonymous', accessToken: null, user: null });
}

let inflight: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<boolean> {
  const stored = await refreshTokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(stored ? { refreshToken: stored } : {}),
    });
  } catch {
    await goOffline();
    return false;
  }
  if (!res.ok) {
    if (res.status === 401) await clearSession();
    else await goOffline();
    return false;
  }
  const body = (await res.json()) as { data: unknown };
  await applySession(sessionResponseSchema.parse(body.data));
  return true;
}

/** Couldn't reach the server while starting up: continue offline as the remembered account. */
async function goOffline(): Promise<void> {
  if (useSession.getState().status !== 'loading') return;
  const user = await rememberedUser();
  useSession.setState({ status: 'offline', accessToken: null, user });
}
