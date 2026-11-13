import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MatchEventsService } from './match-events.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchEventsService],
  exports: [MatchesService],
})
export class MatchesModule {}
