import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { RawResponse } from '../common/envelope.interceptor';
import { StorageService } from './storage.service';

const AVATAR_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Serves stored media. Keys are random and change on every upload, so responses cache forever. */
@Public()
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('avatars/:file')
  @RawResponse()
  async avatar(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const data = AVATAR_FILE.test(file) ? await this.storage.get(`avatars/${file}`) : null;
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Image not found.');
    res
      .status(200)
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // The Android app and spectator pages load avatars from another origin.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .send(data);
  }
}
