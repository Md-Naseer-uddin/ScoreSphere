import { vi } from 'vitest';

type Handler = (
  init: RequestInit & { url: string },
) => { status?: number; body?: unknown } | undefined;

/**
 * Stubs global fetch with handlers keyed by "METHOD /path" (path relative to /api/v1).
 * Unmatched requests fail loudly so tests don't silently hit the network.
 */
export function mockApi(routes: Record<string, Handler | { status?: number; body?: unknown }>) {
  const calls: { method: string; path: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^.*\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, path, init });
    const key = `${method} ${path.split('?')[0]}`;
    // Keys ending in `*` match any path with that prefix, e.g. "POST /matches/*".
    const route =
      routes[`${method} ${path}`] ??
      routes[key] ??
      Object.entries(routes).find(([k]) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))?.[1];
    const result = typeof route === 'function' ? route({ ...init, url }) : route;
    if (!result) throw new Error(`Unmocked request: ${method} ${path}`);
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const ok = (data: unknown) => ({ status: 200, body: { data, meta: { requestId: 'test' } } });

export const fail = (
  status: number,
  code: string,
  details: { field: string; code: string }[] = [],
) => ({
  status,
  body: { error: { code, message: code, details }, meta: { requestId: 'test' } },
});
