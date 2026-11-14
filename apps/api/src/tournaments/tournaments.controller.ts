import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  addTournamentEntriesRequestSchema,
  createTournamentRequestSchema,
  decideFixtureRequestSchema,
  type Leaderboard,
  type StandingsRowDto,
  type Tournament,
  type TournamentAward,
  type TournamentDetail,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import { TournamentsService } from './tournaments.service';

class CreateTournamentDto extends createZodDto(createTournamentRequestSchema) {}
class AddEntriesDto extends createZodDto(addTournamentEntriesRequestSchema) {}
class DecideFixtureDto extends createZodDto(decideFixtureRequestSchema) {}

const uuid = new ParseUUIDPipe();

@Controller()
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Post('workspaces/:workspaceId/tournaments')
  @WorkspaceRoute('SCORER')
  create(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: CreateTournamentDto,
  ): Promise<Tournament> {
    return this.tournaments.create(ctx, body);
  }

  @Get('workspaces/:workspaceId/tournaments')
  @WorkspaceRoute('VIEWER')
  list(@CurrentWorkspace() ctx: WorkspaceContext): Promise<Tournament[]> {
    return this.tournaments.list(ctx);
  }

  @Get('tournaments/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TournamentDetail> {
    return this.tournaments.detail(user, id);
  }

  @Post('tournaments/:id/entries')
  @HttpCode(200)
  addEntries(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() body: AddEntriesDto,
  ): Promise<TournamentDetail> {
    return this.tournaments.addEntries(user, id, body);
  }

  @Delete('tournaments/:id/entries/:entryId')
  removeEntry(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('entryId', uuid) entryId: string,
  ): Promise<TournamentDetail> {
    return this.tournaments.removeEntry(user, id, entryId);
  }

  @Post('tournaments/:id/fixtures')
  @HttpCode(200)
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<TournamentDetail> {
    return this.tournaments.generate(user, id);
  }

  @Post('tournaments/:id/fixtures/:fixtureId/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('fixtureId', uuid) fixtureId: string,
    @Body() body: DecideFixtureDto,
  ): Promise<TournamentDetail> {
    return this.tournaments.decide(user, id, fixtureId, body.winnerEntryId);
  }

  @Get('tournaments/:id/standings')
  standings(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<StandingsRowDto[]> {
    return this.tournaments.standings(user, id);
  }

  @Get('tournaments/:id/leaderboards')
  leaderboards(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<Leaderboard[]> {
    return this.tournaments.leaderboards(user, id);
  }

  @Get('tournaments/:id/awards')
  awards(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TournamentAward[]> {
    return this.tournaments.awards(user, id);
  }

  /** Publishes the awards again from current results, after reviewing stale ones. */
  @Post('tournaments/:id/awards/publish')
  @HttpCode(200)
  republish(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<TournamentAward[]> {
    return this.tournaments.republish(user, id);
  }
}
