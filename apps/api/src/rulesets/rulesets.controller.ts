import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type Ruleset,
  type RulesetVersion,
  saveRulesetRequestSchema,
  saveRulesetVersionRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import {
  CurrentWorkspace,
  type WorkspaceContext,
  WorkspaceRoute,
} from '../workspaces/workspace-access';
import { RulesetsService } from './rulesets.service';

class SaveRulesetDto extends createZodDto(saveRulesetRequestSchema) {}
class SaveRulesetVersionDto extends createZodDto(saveRulesetVersionRequestSchema) {}

const uuid = new ParseUUIDPipe();

@Controller('workspaces/:workspaceId/rulesets')
export class RulesetsController {
  constructor(private readonly rulesets: RulesetsService) {}

  @Get()
  @WorkspaceRoute('VIEWER')
  list(@CurrentWorkspace() ctx: WorkspaceContext): Promise<Ruleset[]> {
    return this.rulesets.list(ctx);
  }

  @Post()
  @WorkspaceRoute('SCORER')
  create(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() body: SaveRulesetDto,
  ): Promise<Ruleset> {
    return this.rulesets.create(ctx, body);
  }

  @Get(':rulesetId/versions')
  @WorkspaceRoute('VIEWER')
  versions(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rulesetId', uuid) id: string,
  ): Promise<RulesetVersion[]> {
    return this.rulesets.versions(ctx, id);
  }

  @Post(':rulesetId/versions')
  @WorkspaceRoute('SCORER')
  saveVersion(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rulesetId', uuid) id: string,
    @Body() body: SaveRulesetVersionDto,
  ): Promise<Ruleset> {
    return this.rulesets.saveVersion(ctx, id, body);
  }

  @Delete(':rulesetId')
  @HttpCode(204)
  @WorkspaceRoute('ADMIN')
  async archive(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('rulesetId', uuid) id: string,
  ): Promise<void> {
    await this.rulesets.archive(ctx, id);
  }
}
