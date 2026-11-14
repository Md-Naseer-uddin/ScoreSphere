import { Module } from '@nestjs/common';
import { MatchesModule } from '../matches/matches.module';
import { LiveController, PublicLiveController } from './live.controller';
import { LiveService } from './live.service';
import { MatchUpdatesListener } from './match-updates.listener';

@Module({
  imports: [MatchesModule],
  controllers: [LiveController, PublicLiveController],
  providers: [LiveService, MatchUpdatesListener],
  exports: [LiveService],
})
export class LiveModule {}
