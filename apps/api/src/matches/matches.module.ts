import { Module } from '@nestjs/common';
import { AwardsModule } from '../awards/awards.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MatchEventsService } from './match-events.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [WorkspacesModule, AwardsModule, TournamentsModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchEventsService],
  exports: [MatchesService],
})
export class MatchesModule {}
