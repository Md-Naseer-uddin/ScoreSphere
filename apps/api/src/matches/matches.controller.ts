import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  type LeaseResponse,
  leaseRequestSchema,
  type MatchDetail,
  matchStatusSchema,
  type MatchSummary,
  type PostMatchEventsResponse,
  postMatchEventsRequestSchema,
  type StoredMatchEvent,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import { MatchEventsService } from './match-events.service';
import { MatchesService } from './matches.service';

class PostMatchEventsDto extends createZodDto(postMatchEventsRequestSchema) {}
class LeaseDto extends createZodDto(leaseRequestSchema) {}
class ListMatchesQueryDto extends createZodDto(
  z.object({
    status: matchStatusSchema.optional(),
    before: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
) {}
class EventsQueryDto extends createZodDto(
  z.object({ after: z.coerce.number().int().min(0).default(0) }),
) {}

const uuid = new ParseUUIDPipe();

@Controller()
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly events: MatchEventsService,
  ) {}

  @Get('workspaces/:workspaceId/matches')
  @WorkspaceRoute('VIEWER')
  list(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query() query: ListMatchesQueryDto,
  ): Promise<MatchSummary[]> {
    return this.matches.list(ctx, {
      status: query.status,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit,
    });
  }

  @Get('matches/:matchId')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
  ): Promise<MatchDetail> {
    return this.matches.detail(user, matchId);
  }

  @Get('matches/:matchId/events')
  listEvents(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Query() query: EventsQueryDto,
  ): Promise<StoredMatchEvent[]> {
    return this.matches.events(user, matchId, query.after);
  }

  /** The single write path for scoring, corrections and lifecycle (ADR 0004). */
  @Post('matches/:matchId/events')
  @HttpCode(200)
  postEvents(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Body() body: PostMatchEventsDto,
  ): Promise<PostMatchEventsResponse> {
    return this.events.ingest(user, matchId, body);
  }

  @Post('matches/:matchId/lease')
  @HttpCode(200)
  lease(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Body() body: LeaseDto,
  ): Promise<LeaseResponse> {
    return this.matches.lease(user, matchId, body);
  }
}
