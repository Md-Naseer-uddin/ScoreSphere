import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { type AwardRecord, selectAwardRequestSchema } from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import { AwardsService } from './awards.service';

class SelectAwardDto extends createZodDto(selectAwardRequestSchema) {}

const uuid = new ParseUUIDPipe();

@Controller('matches/:matchId/awards')
export class AwardsController {
  constructor(private readonly awards: AwardsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
  ): Promise<AwardRecord[]> {
    return this.awards.list(user, matchId);
  }

  /** Organizer selection or override (workspace admins); audited. */
  @Put(':awardKey')
  select(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Param('awardKey') awardKey: string,
    @Body() body: SelectAwardDto,
  ): Promise<AwardRecord[]> {
    return this.awards.select(user, matchId, awardKey, body);
  }

  /** Withdraws an organizer's choice so the automatic award applies again. */
  @Delete(':awardKey')
  revert(
    @CurrentUser() user: AuthUser,
    @Param('matchId', uuid) matchId: string,
    @Param('awardKey') awardKey: string,
  ): Promise<AwardRecord[]> {
    return this.awards.revert(user, matchId, awardKey);
  }
}
