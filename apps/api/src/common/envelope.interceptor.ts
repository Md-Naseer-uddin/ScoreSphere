import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

const RAW_RESPONSE = 'scoresphere:raw-response';

/** Opt a handler out of the `{ data, meta }` envelope (e.g. SSE streams). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

/** Wraps handler results in the spec's success envelope (api §1). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw || context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request & { id?: unknown }>();
    return next
      .handle()
      .pipe(map((data: unknown) => ({ data, meta: { requestId: String(req.id ?? '') } })));
  }
}
