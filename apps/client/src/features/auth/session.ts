import { type SessionResponse, sessionResponseSchema } from '@scoresphere/contracts';
import { create } from 'zustand';
import { env } from '@/lib/env';
import { refreshTokenStore } from './refresh-token-store';

/**
 * `loading` until the first refresh attempt settles; `offline` when that attempt couldn't
 * reach the server (we don't know yet whether the user is signed in).
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
}

export async function clearSession(): Promise<void> {
  await refreshTokenStore.clear();
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
    if (useSession.getState().status === 'loading') useSession.setState({ status: 'offline' });
    return false;
  }
  if (!res.ok) {
    if (res.status === 401) await clearSession();
    else if (useSession.getState().status === 'loading') useSession.setState({ status: 'offline' });
    return false;
  }
  const body = (await res.json()) as { data: unknown };
  await applySession(sessionResponseSchema.parse(body.data));
  return true;
}
