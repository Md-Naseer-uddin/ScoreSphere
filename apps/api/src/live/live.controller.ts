import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CreatedShareLink,
  createShareLinkRequestSchema,
  type LiveSnapshot,
  SHARE_TOKEN_HEADER,
  type ShareLink,
} from '@scoresphere/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Public } from '../auth/decorators';
import { RawResponse } from '../common/envelope.interceptor';
import { MatchesService } from '../matches/matches.service';
import { LiveService } from './live.service';

class CreateShareLinkDto extends createZodDto(createShareLinkRequestSchema) {}

const uuid = new ParseUUIDPipe();

const shareToken = (req: Request) => {
  const value = req.headers[SHARE_TOKEN_HEADER];
  return typeof value === 'string' ? value : undefined;
};

@Controller('matches/:matchId')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly matches: MatchesService,
  ) {}

  @Post('share-links')
  async createLink(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Body() body: CreateShareLinkDto,
  ): Promise<CreatedShareLink> {
    await this.matches.access(user, matchId, 'SCORER');
    return this.live.createLink(matchId, user.id, body.expiresInHours);
  }

  @Get('share-links')
  async listLinks(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
  ): Promise<ShareLink[]> {
    await this.matches.access(user, matchId, 'SCORER');
    return this.live.listLinks(matchId);
  }

  @Delete('share-links/:linkId')
  @HttpCode(204)
  async revokeLink(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Param('linkId', uuid) linkId: string,
  ): Promise<void> {
    await this.matches.access(user, matchId, 'SCORER');
    await this.live.revokeLink(matchId, linkId);
  }

  /** In-app live view for workspace members (SSE; resume with `Last-Event-ID`). */
  @Get('stream')
  @RawResponse()
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.matches.access(user, matchId, 'VIEWER');
    this.live.stream(req, res, matchId);
  }
}

/**
 * Spectator endpoints. The share token travels in a header, never the URL, so it stays
 * out of server logs and `Referer` headers (ADR 0021).
 */
@Controller('public/live')
@Public()
export class PublicLiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async snapshot(@Req() req: Request): Promise<LiveSnapshot> {
    const matchId = await this.live.resolveToken(shareToken(req));
    return this.live.snapshot(matchId);
  }

  @Get('stream')
  @RawResponse()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async stream(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = shareToken(req);
    const matchId = await this.live.resolveToken(token);
    this.live.stream(req, res, matchId, () =>
      this.live.resolveToken(token).then(
        (id) => id === matchId,
        () => false,
      ),
    );
  }
}
