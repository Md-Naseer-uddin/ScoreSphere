import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [RulesetsController],
  providers: [RulesetsService],
})
export class RulesetsModule {}
