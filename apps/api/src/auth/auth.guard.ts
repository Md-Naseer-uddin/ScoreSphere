import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/api-error';
import { AccessTokenService } from './access-token.service';
import { type AuthenticatedRequest, IS_PUBLIC_KEY } from './decorators';
import { SessionService } from './session.service';

/** Global guard: every route needs a valid access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      const claims = await this.tokens.verify(token);
      if (claims && (await this.sessions.isActive(claims.sessionId, claims.userId))) {
        req.user = { id: claims.userId, sessionId: claims.sessionId };
        return true;
      }
    }
    if (isPublic) return true;
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
}
