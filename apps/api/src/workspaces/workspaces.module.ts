import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { WorkspaceAccessGuard } from './workspace-access';
import {
  InvitationsController,
  OrganizationsController,
  WorkspacesController,
} from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [WorkspacesController, OrganizationsController, InvitationsController],
  providers: [WorkspacesService, InvitationsService, WorkspaceAccessGuard],
  exports: [WorkspaceAccessGuard, WorkspacesService],
})
export class WorkspacesModule {}
