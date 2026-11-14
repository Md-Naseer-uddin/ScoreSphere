import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { deleteAccountRequestSchema } from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import { AccountService } from './account.service';

class DeleteAccountDto extends createZodDto(deleteAccountRequestSchema) {}

@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** A copy of everything ScoreSphere holds about the signed-in user (DPDP right to access). */
  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  export(@CurrentUser() user: AuthUser) {
    return this.account.export(user.id);
  }

  /** Erases the account (DPDP right to erasure). Organisation records stay, unlinked. */
  @Post('deletion')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  async delete(@CurrentUser() user: AuthUser, @Body() body: DeleteAccountDto): Promise<void> {
    await this.account.delete(user.id, body.password);
  }
}
