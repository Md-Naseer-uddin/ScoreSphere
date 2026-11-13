import { errorEnvelopeSchema, type ErrorCode } from '@scoresphere/contracts';
import type { z } from 'zod';
import { getAccessToken, refreshSession } from '@/features/auth/session';
import { env } from './env';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** Every failed API call surfaces as this, so screens handle one error shape. */
export class ApiClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number,
    readonly details: { field: string; code: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type ApiInit = RequestInit & {
  /** Attach the access token and retry once after refreshing on 401. Default true. */
  auth?: boolean;
};

/** JSON request body plus its content type, e.g. `apiFetch(path, { method: 'POST', ...json(data) })`. */
export function json(data: unknown): Pick<RequestInit, 'body' | 'headers'> {
  return { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } };
}

/** Calls the API and returns the unwrapped `data`, validated against `schema` when given. */
export async function apiFetch<T>(
  path: string,
  init: ApiInit = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const { auth = true, ...rest } = init;

  const send = async (): Promise<Response> => {
    const headers = new Headers(rest.headers);
    headers.set('Accept', 'application/json');
    const token = auth ? getAccessToken() : null;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    try {
      return await fetch(`${env.apiUrl}${path}`, { ...rest, headers, credentials: 'include' });
    } catch {
      throw new ApiClientError('NETWORK_ERROR', 'You appear to be offline.', 0);
    }
  };

  let res = await send();
  if (auth && res.status === 401 && (await refreshSession())) res = await send();

  const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = errorEnvelopeSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(code, message, res.status, details, parsed.data.meta.requestId);
    }
    throw new ApiClientError('INVALID_RESPONSE', 'Unexpected server response.', res.status);
  }

  const data = (body as { data?: unknown } | undefined)?.data;
  if (!schema) return data as T;
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiClientError('INVALID_RESPONSE', 'Unexpected server response.', res.status);
  }
  return result.data;
}

/** Turns a server-relative media path (e.g. an avatar) into a loadable URL. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  return path ? `${env.apiUrl}${path}` : undefined;
}
