import { Controller, Get, Query } from '@nestjs/common';
import type { ReferenceSync } from '@scoresphere/contracts';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('reference')
  reference(@CurrentUser() user: AuthUser, @Query('since') since?: string): Promise<ReferenceSync> {
    const date = since ? new Date(since) : null;
    if (date && Number.isNaN(date.getTime())) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor.', [
        { field: 'since', code: 'INVALID_CURSOR' },
      ]);
    }
    return this.sync.reference(user.id, date);
  }
}
