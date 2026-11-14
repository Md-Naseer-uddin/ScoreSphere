import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { type PlayerStats, statsQuerySchema } from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import { StatsService } from './stats.service';

class StatsQueryDto extends createZodDto(statsQuerySchema) {}

const uuid = new ParseUUIDPipe();

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('workspaces/:workspaceId/roster-members/:memberId/stats')
  @WorkspaceRoute('VIEWER')
  player(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('memberId', uuid) memberId: string,
    @Query() query: StatsQueryDto,
  ): Promise<PlayerStats> {
    return this.stats.player(ctx, memberId, query);
  }

  @Get('workspaces/:workspaceId/teams/:teamId/stats')
  @WorkspaceRoute('VIEWER')
  team(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) teamId: string,
    @Query() query: StatsQueryDto,
  ): Promise<PlayerStats> {
    return this.stats.team(ctx, teamId, query);
  }

  @Get('me/stats')
  me(@CurrentUser() user: AuthUser, @Query() query: StatsQueryDto): Promise<PlayerStats> {
    return this.stats.me(user, query);
  }
}
