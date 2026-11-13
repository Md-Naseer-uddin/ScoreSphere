import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, mockApi, ok } from '@/test/fetch-mock';
import { clearSession, OFFLINE_WINDOW_MS, refreshSession, useSession } from './session';

const session = {
  accessToken: 'a',
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  user: { id: '01a1d66d-0000-7000-8000-000000000001', displayName: 'Asha' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  useSession.setState({ status: 'loading', accessToken: null, user: null });
});

describe('refreshSession', () => {
  it('shares one request between concurrent callers', async () => {
    const { fetchMock } = mockApi({ 'POST /auth/refresh': ok(session) });
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', accessToken: 'a' });
  });

  it('becomes anonymous when the server rejects the refresh token', async () => {
    mockApi({ 'POST /auth/refresh': fail(401, 'UNAUTHENTICATED') });
    expect(await refreshSession()).toBe(false);
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('reports offline when the server is unreachable during startup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    expect(await refreshSession()).toBe(false);
    expect(useSession.getState().status).toBe('offline');
  });
});

describe('offline start', () => {
  const offlineFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );

  it('continues as the last signed-in account so scoring works offline', async () => {
    mockApi({ 'POST /auth/refresh': ok(session) });
    await refreshSession();
    useSession.setState({ status: 'loading', accessToken: null, user: null });
    offlineFetch();
    await refreshSession();
    expect(useSession.getState()).toMatchObject({
      status: 'offline',
      accessToken: null,
      user: session.user,
    });
  });

  it('forgets the account on sign-out', async () => {
    mockApi({ 'POST /auth/refresh': ok(session) });
    await refreshSession();
    await clearSession();
    useSession.setState({ status: 'loading' });
    offlineFetch();
    await refreshSession();
    expect(useSession.getState()).toMatchObject({ status: 'offline', user: null });
  });

  it('stops offline access after the offline window', async () => {
    mockApi({ 'POST /auth/refresh': ok(session) });
    await refreshSession();
    useSession.setState({ status: 'loading', accessToken: null, user: null });
    offlineFetch();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + OFFLINE_WINDOW_MS + 60_000);
    await refreshSession();
    vi.restoreAllMocks();
    expect(useSession.getState()).toMatchObject({ status: 'offline', user: null });
  });
});
