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
import type {
  CreatedInvitation,
  Invitation,
  InvitationPreview,
  Member,
  WorkspaceDetail,
  WorkspaceSummary,
} from '@scoresphere/contracts';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import {
  CreateInvitationDto,
  CreateOrganizationDto,
  InvitationTokenDto,
  UpdateMemberDto,
  UpdateWorkspaceDto,
} from './dto';
import { InvitationsService } from './invitations.service';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceRoute } from './workspace-access';
import { WorkspacesService } from './workspaces.service';

const uuid = new ParseUUIDPipe();

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WorkspaceSummary[]> {
    return this.workspaces.listForUser(user.id);
  }

  @Get(':workspaceId')
  @WorkspaceRoute('VIEWER')
  get(@CurrentWorkspace() ctx: WorkspaceContext): Promise<WorkspaceDetail> {
    return this.workspaces.getDetail(ctx);
  }

  @Patch(':workspaceId')
  @WorkspaceRoute('ADMIN')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: UpdateWorkspaceDto,
  ): Promise<WorkspaceDetail> {
    return this.workspaces.update(ctx, body);
  }

  @Get(':workspaceId/members')
  @WorkspaceRoute('VIEWER')
  members(@CurrentWorkspace() ctx: WorkspaceContext): Promise<Member[]> {
    return this.workspaces.listMembers(ctx);
  }

  @Patch(':workspaceId/members/:membershipId')
  @WorkspaceRoute('ADMIN')
  changeRole(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('membershipId', uuid) membershipId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<Member[]> {
    return this.workspaces.changeRole(ctx, membershipId, body.role);
  }

  /** VIEWER so members can leave; removing someone else needs ADMIN (checked in the service). */
  @Delete(':workspaceId/members/:membershipId')
  @WorkspaceRoute('VIEWER')
  @HttpCode(204)
  async removeMember(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('membershipId', uuid) membershipId: string,
  ): Promise<void> {
    await this.workspaces.removeMember(ctx, membershipId);
  }

  @Post(':workspaceId/invitations')
  @WorkspaceRoute('ADMIN')
  createInvitation(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    return this.invitations.create(ctx, body.role);
  }

  @Get(':workspaceId/invitations')
  @WorkspaceRoute('ADMIN')
  listInvitations(@CurrentWorkspace() ctx: WorkspaceContext): Promise<Invitation[]> {
    return this.invitations.listPending(ctx);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @WorkspaceRoute('ADMIN')
  @HttpCode(204)
  async revokeInvitation(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('invitationId', uuid) invitationId: string,
  ): Promise<void> {
    await this.invitations.revoke(ctx, invitationId);
  }
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOrganizationDto,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.createOrganization(user.id, body);
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('preview')
  @HttpCode(200)
  preview(
    @CurrentUser() user: AuthUser,
    @Body() body: InvitationTokenDto,
  ): Promise<InvitationPreview> {
    return this.invitations.preview(user.id, body.token);
  }

  @Post('accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Body() body: InvitationTokenDto,
  ): Promise<WorkspaceSummary> {
    return this.invitations.accept(user.id, body.token);
  }
}
