import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useSession } from '@/features/auth/session';
import { fail, mockApi, ok } from '@/test/fetch-mock';
import { signIn, signOut } from '@/test/session';
import { apiFetch, ApiClientError } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

const session = {
  accessToken: 'fresh-token',
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  user: { id: '01a1d66d-0000-7000-8000-000000000001', displayName: 'Asha' },
};

describe('apiFetch', () => {
  it('unwraps and validates data and sends the access token', async () => {
    signIn();
    const { calls } = mockApi({ 'GET /health': ok({ status: 'ok' }) });
    await expect(apiFetch('/health', {}, z.object({ status: z.string() }))).resolves.toEqual({
      status: 'ok',
    });
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    expect(calls[0]!.init.credentials).toBe('include');
  });

  it('turns the error envelope into ApiClientError', async () => {
    mockApi({
      'POST /x': fail(400, 'VALIDATION_ERROR', [{ field: 'phone', code: 'INVALID_PHONE' }]),
    });
    const error = await apiFetch('/x', { method: 'POST', auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      details: [{ field: 'phone', code: 'INVALID_PHONE' }],
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiFetch('/x', { auth: false })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    signIn();
    let attempts = 0;
    const { calls } = mockApi({
      'GET /me': () => (++attempts === 1 ? fail(401, 'UNAUTHENTICATED') : ok({ id: 'me' })),
      'POST /auth/refresh': ok(session),
    });
    await expect(apiFetch('/me')).resolves.toEqual({ id: 'me' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /me',
      'POST /auth/refresh',
      'GET /me',
    ]);
    expect(new Headers(calls[2]!.init.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('signs out when the refresh is rejected', async () => {
    signIn();
    mockApi({
      'GET /me': fail(401, 'UNAUTHENTICATED'),
      'POST /auth/refresh': fail(401, 'UNAUTHENTICATED'),
    });
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('rejects data that fails the schema', async () => {
    mockApi({ 'GET /x': ok({ status: 42 }) });
    await expect(
      apiFetch('/x', { auth: false }, z.object({ status: z.string() })),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
