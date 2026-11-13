import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ErrorCode, ErrorEnvelope } from '@scoresphere/contracts';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { PinoLogger } from 'nestjs-pino';
import { ApiError } from './api-error';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Renders every error as the spec's error envelope (api §1).
 * Never leaks stack traces, SQL or internal messages for unexpected errors.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: unknown }>();
    const res = http.getResponse<Response>();
    const { status, error } = this.describe(exception);

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled error');
    }

    const body: ErrorEnvelope = { error, meta: { requestId: String(req.id ?? '') } };
    res.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; error: ErrorEnvelope['error'] } {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      const details = zodError.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
      }));
      return {
        status: HttpStatus.BAD_REQUEST,
        error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', details },
      };
    }
    if (exception instanceof ApiError) {
      return {
        status: exception.getStatus(),
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
      const message = status >= 500 ? 'Something went wrong.' : exception.message;
      return { status, error: { code, message } };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    };
  }
}
