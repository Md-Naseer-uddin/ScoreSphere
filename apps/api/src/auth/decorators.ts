import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

const IS_PUBLIC = 'scoresphere:public';

/** Marks a route as reachable without an access token. Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const IS_PUBLIC_KEY = IS_PUBLIC;

/** The authenticated user; only valid on non-public routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new Error('CurrentUser used on an unauthenticated route');
    return req.user;
  },
);
