import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  addTeamMembersRequestSchema,
  createTeamRequestSchema,
  type Team,
  type TeamDetail,
  updateTeamRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import { TeamsService } from './teams.service';

class CreateTeamDto extends createZodDto(createTeamRequestSchema) {}
class UpdateTeamDto extends createZodDto(updateTeamRequestSchema) {}
class AddTeamMembersDto extends createZodDto(addTeamMembersRequestSchema) {}

const uuid = new ParseUUIDPipe();

@Controller('workspaces/:workspaceId/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @WorkspaceRoute('VIEWER')
  list(@CurrentWorkspace() ctx: WorkspaceContext): Promise<Team[]> {
    return this.teams.list(ctx);
  }

  @Post()
  @WorkspaceRoute('SCORER')
  create(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: CreateTeamDto,
  ): Promise<TeamDetail> {
    return this.teams.create(ctx, body);
  }

  @Get(':teamId')
  @WorkspaceRoute('VIEWER')
  get(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) id: string,
  ): Promise<TeamDetail> {
    return this.teams.get(ctx, id);
  }

  @Patch(':teamId')
  @WorkspaceRoute('SCORER')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) id: string,
    @Body() body: UpdateTeamDto,
  ): Promise<TeamDetail> {
    return this.teams.update(ctx, id, body);
  }

  @Delete(':teamId')
  @HttpCode(204)
  @WorkspaceRoute('SCORER')
  async archive(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) id: string,
  ): Promise<void> {
    await this.teams.archive(ctx, id);
  }

  @Post(':teamId/members')
  @HttpCode(200)
  @WorkspaceRoute('SCORER')
  addMembers(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) id: string,
    @Body() body: AddTeamMembersDto,
  ): Promise<TeamDetail> {
    return this.teams.addMembers(ctx, id, body.rosterMemberIds);
  }

  @Delete(':teamId/members/:membershipId')
  @WorkspaceRoute('SCORER')
  removeMember(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('teamId', uuid) id: string,
    @Param('membershipId', uuid) membershipId: string,
  ): Promise<TeamDetail> {
    return this.teams.removeMember(ctx, id, membershipId);
  }
}
