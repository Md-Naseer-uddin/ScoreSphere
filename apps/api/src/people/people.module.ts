import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MyRosterLinksController, RosterController } from './roster.controller';
import { RosterLinksService } from './roster-links.service';
import { RosterService } from './roster.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [RosterController, MyRosterLinksController],
  providers: [RosterService, RosterLinksService],
})
export class PeopleModule {}
