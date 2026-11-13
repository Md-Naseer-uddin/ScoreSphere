import type { IncomingMessage, ServerResponse } from 'node:http';
import { newId } from '@scoresphere/contracts';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/** Reuses a well-formed incoming `x-request-id`, otherwise mints one, and echoes it back. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : newId();
  res.setHeader('x-request-id', id);
  return id;
}

/**
 * Fields that must never reach logs (ADR 0024, plan §4). Request bodies are not
 * logged at all; these paths catch anything attached to a log line by hand.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-share-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.phone',
  '*.recoveryCode',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: requestId,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      // Keep request logs lean: no headers, and no query string (it can carry tokens).
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}
