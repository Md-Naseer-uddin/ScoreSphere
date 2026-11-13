import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
