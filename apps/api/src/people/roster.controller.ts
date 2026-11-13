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
  Query,
} from '@nestjs/common';
import type { LookupResult, MyRosterLink, RosterMember } from '@scoresphere/contracts';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import {
  CreateRosterMemberDto,
  LinkRosterMemberDto,
  LookupDto,
  UpdateRosterMemberDto,
} from './dto';
import { RosterLinksService } from './roster-links.service';
import { RosterService } from './roster.service';

const uuid = new ParseUUIDPipe();

/** Scorers manage rosters (they set up matches); admins review claims. */
@Controller('workspaces/:workspaceId')
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Post('people/lookup')
  @HttpCode(200)
  @WorkspaceRoute('SCORER')
  // Slows down anyone trying to enumerate numbers through lookups.
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  lookup(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: LookupDto,
  ): Promise<LookupResult> {
    return this.roster.lookup(ctx, body.phone);
  }

  @Get('roster-members')
  @WorkspaceRoute('VIEWER')
  list(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<RosterMember[]> {
    return this.roster.list(ctx, includeArchived === 'true');
  }

  @Post('roster-members')
  @WorkspaceRoute('SCORER')
  create(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: CreateRosterMemberDto,
  ): Promise<RosterMember> {
    return this.roster.create(ctx, body);
  }

  @Patch('roster-members/:rosterMemberId')
  @WorkspaceRoute('SCORER')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rosterMemberId', uuid) id: string,
    @Body() body: UpdateRosterMemberDto,
  ): Promise<RosterMember> {
    return this.roster.update(ctx, id, body);
  }

  @Post('roster-members/:rosterMemberId/link')
  @HttpCode(200)
  @WorkspaceRoute('SCORER')
  link(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rosterMemberId', uuid) id: string,
    @Body() body: LinkRosterMemberDto,
  ): Promise<RosterMember> {
    return this.roster.link(ctx, id, body);
  }

  @Post('roster-members/:rosterMemberId/approve-claim')
  @HttpCode(200)
  @WorkspaceRoute('ADMIN')
  approve(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rosterMemberId', uuid) id: string,
  ): Promise<RosterMember> {
    return this.roster.decideClaim(ctx, id, true);
  }

  @Post('roster-members/:rosterMemberId/reject-claim')
  @HttpCode(200)
  @WorkspaceRoute('ADMIN')
  reject(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rosterMemberId', uuid) id: string,
  ): Promise<RosterMember> {
    return this.roster.decideClaim(ctx, id, false);
  }

  @Delete('roster-members/:rosterMemberId')
  @HttpCode(204)
  @WorkspaceRoute('SCORER')
  async archive(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rosterMemberId', uuid) id: string,
  ): Promise<void> {
    await this.roster.archive(ctx, id);
  }
}

@Controller('me/roster-links')
export class MyRosterLinksController {
  constructor(private readonly links: RosterLinksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<MyRosterLink[]> {
    return this.links.listMine(user.id);
  }

  @Post(':rosterMemberId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('rosterMemberId', uuid) id: string,
  ): Promise<MyRosterLink[]> {
    return this.links.accept(user.id, id);
  }

  @Post(':rosterMemberId/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('rosterMemberId', uuid) id: string,
  ): Promise<MyRosterLink[]> {
    return this.links.decline(user.id, id);
  }
}
