import { errorEnvelopeSchema, type ErrorCode } from '@scoresphere/contracts';
import type { z } from 'zod';
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

/** Calls the API and returns the unwrapped `data`, validated against `schema` when given. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 'You appear to be offline.', 0);
  }

  const body: unknown = await res.json().catch(() => undefined);

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
