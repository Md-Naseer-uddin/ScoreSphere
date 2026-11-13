import { Controller, Delete, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Me } from '@scoresphere/contracts';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../auth/decorators';
import { AVATAR_MAX_BYTES, AvatarService } from './avatar.service';

@Controller('me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Put()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(
    // No `dest`/`storage`: multer keeps the upload in memory for re-encoding.
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Me> {
    return this.avatars.replace(user.id, file?.buffer);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.avatars.remove(user.id);
  }
}
