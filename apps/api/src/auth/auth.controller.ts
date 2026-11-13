import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { RegisterResponse, SessionResponse } from '@scoresphere/contracts';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiError } from '../common/api-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AccessTokenService } from './access-token.service';
import { AuthService, type SignedIn } from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './cookies';
import { type AuthenticatedRequest, Public } from './decorators';
import { LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from './dto';
import { SessionService } from './session.service';

const HOUR = 3_600_000;
const MINUTE = 60_000;

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly tokens: AccessTokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponse> {
    const result = await this.auth.register(body);
    const session = await this.respond(result, body.device.platform, res);
    return { ...session, recoveryCode: result.recoveryCode };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respond(await this.auth.login(body), body.device.platform, res);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = body.refreshToken ?? this.cookieToken(req);
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return this.respond(await this.auth.refresh(token), body.refreshToken ? 'ANDROID' : 'WEB', res);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: RefreshDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = body.refreshToken ?? this.cookieToken(req);
    if (token) await this.sessions.revokeByRefreshToken(token);
    else if (req.user) await this.sessions.revokeBySessionId(req.user.sessionId, 'LOGOUT');
    clearRefreshCookie(res, this.secureCookies);
  }

  @Post('password/reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  resetPassword(@Body() body: ResetPasswordDto): Promise<{ recoveryCode: string }> {
    return this.auth.resetPassword(body);
  }

  /** Android gets the refresh token in the body; the web gets an httpOnly cookie (ADR 0020). */
  private async respond(
    result: SignedIn,
    platform: 'WEB' | 'ANDROID',
    res: Response,
  ): Promise<SessionResponse> {
    const access = await this.tokens.sign({
      userId: result.user.id,
      sessionId: result.session.sessionId,
    });
    const body: SessionResponse = {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: result.user,
    };
    if (platform === 'ANDROID') return { ...body, refreshToken: result.session.refreshToken };
    setRefreshCookie(
      res,
      result.session.refreshToken,
      result.session.refreshExpiresAt,
      this.secureCookies,
    );
    return body;
  }

  private cookieToken(req: AuthenticatedRequest): string | undefined {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value ? value : undefined;
  }

  private get secureCookies(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
