import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { Device, Me } from '@scoresphere/contracts';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import { ChangePasswordDto, ChangePhoneDto, ConfirmPasswordDto, UpdateMeDto } from './dto';
import { UsersService } from './users.service';

const FIFTEEN_MINUTES = 15 * 60_000;

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.users.getMe(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto): Promise<Me> {
    return this.users.updateMe(user.id, body);
  }

  @Post('password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(
      user.id,
      user.sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('phone')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  changePhone(@CurrentUser() user: AuthUser, @Body() body: ChangePhoneDto): Promise<Me> {
    return this.users.changePhone(user.id, body.currentPassword, body.newPhone);
  }

  @Post('recovery-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  regenerateRecoveryCode(
    @CurrentUser() user: AuthUser,
    @Body() body: ConfirmPasswordDto,
  ): Promise<{ recoveryCode: string }> {
    return this.users.regenerateRecoveryCode(user.id, body.currentPassword);
  }

  @Get('devices')
  devices(@CurrentUser() user: AuthUser): Promise<Device[]> {
    return this.users.listDevices(user.id, user.sessionId);
  }

  @Delete('devices/:deviceId')
  @HttpCode(204)
  async revokeDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ): Promise<void> {
    await this.users.revokeDevice(user.id, deviceId);
  }
}
