import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiFetch, ApiClientError } from './api';

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('unwraps and validates data', async () => {
    respond(200, { data: { status: 'ok' }, meta: { requestId: 'r1' } });
    await expect(apiFetch('/health', {}, z.object({ status: z.string() }))).resolves.toEqual({
      status: 'ok',
    });
  });

  it('turns the error envelope into ApiClientError', async () => {
    respond(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        details: [{ field: 'phone', code: 'INVALID_PHONE' }],
      },
      meta: { requestId: 'r2' },
    });
    const error = await apiFetch('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      requestId: 'r2',
      details: [{ field: 'phone', code: 'INVALID_PHONE' }],
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('rejects data that fails the schema', async () => {
    respond(200, { data: { status: 42 }, meta: { requestId: 'r3' } });
    await expect(apiFetch('/x', {}, z.object({ status: z.string() }))).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
