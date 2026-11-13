import {
  type LoginRequest,
  recoveryCodeResponseSchema,
  type RegisterRequest,
  registerResponseSchema,
  type ResetPasswordRequest,
  sessionResponseSchema,
} from '@scoresphere/contracts';
import { apiFetch, json } from '@/lib/api';
import { getDeviceId } from '@/lib/db';
import { APP_VERSION, clientPlatform } from '@/lib/platform';
import { queryClient } from '@/lib/query-client';
import { clearReferenceData } from '@/features/sync/reference-sync';
import { refreshTokenStore } from './refresh-token-store';
import { applySession, clearSession } from './session';

async function device() {
  return { deviceId: await getDeviceId(), platform: clientPlatform(), appVersion: APP_VERSION };
}

/** Creates the account and signs in. Returns the one-time recovery code to show the user. */
export async function register(input: Omit<RegisterRequest, 'device'>): Promise<string> {
  const session = await apiFetch(
    '/auth/register',
    { method: 'POST', auth: false, ...json({ ...input, device: await device() }) },
    registerResponseSchema,
  );
  await applySession(session);
  return session.recoveryCode;
}

export async function login(input: Omit<LoginRequest, 'device'>): Promise<void> {
  const session = await apiFetch(
    '/auth/login',
    { method: 'POST', auth: false, ...json({ ...input, device: await device() }) },
    sessionResponseSchema,
  );
  await applySession(session);
}

/** Resets the password with a recovery code. Returns the replacement recovery code. */
export async function resetPassword(input: ResetPasswordRequest): Promise<string> {
  const res = await apiFetch(
    '/auth/password/reset',
    { method: 'POST', auth: false, ...json(input) },
    recoveryCodeResponseSchema,
  );
  return res.recoveryCode;
}

/** Ends the session on the server (best effort) and forgets everything cached locally. */
export async function logout(): Promise<void> {
  const stored = await refreshTokenStore.get();
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      auth: false,
      ...json(stored ? { refreshToken: stored } : {}),
    });
  } catch {
    // Offline or already signed out: the local session is cleared regardless.
  } finally {
    await clearSession();
    queryClient.clear();
    // Shared phones are common: the next person must not see this account's rosters.
    await clearReferenceData().catch(() => undefined);
  }
}

/** Only same-app paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
