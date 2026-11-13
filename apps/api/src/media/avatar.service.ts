import { Inject, Injectable } from '@nestjs/common';
import { type Me, newId } from '@scoresphere/contracts';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';
import { UsersService } from '../users/users.service';
import { StorageService } from './storage.service';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 512;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

const INVALID_IMAGE = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'Choose a JPEG, PNG or WebP photo.', [
    { field: 'file', code: 'INVALID_IMAGE' },
  ]);

/**
 * Avatars are uploaded to the API, which checks the real image type (not the file name
 * or client MIME), strips metadata such as GPS, and re-encodes to a square WebP (ADR 0028).
 */
@Injectable()
export class AvatarService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly users: UsersService,
  ) {}

  async replace(userId: string, upload: Buffer | undefined): Promise<Me> {
    if (!upload || upload.length === 0) throw INVALID_IMAGE();
    const image = await this.reencode(upload);
    const key = `avatars/${newId()}.webp`;
    await this.storage.put(key, image);

    const [previous] = await this.db
      .select({ key: users.avatarKey })
      .from(users)
      .where(eq(users.id, userId));
    await this.db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));
    if (previous?.key) await this.storage.delete(previous.key);
    return this.users.getMe(userId);
  }

  async remove(userId: string): Promise<Me> {
    const [previous] = await this.db
      .select({ key: users.avatarKey })
      .from(users)
      .where(eq(users.id, userId));
    await this.db.update(users).set({ avatarKey: null }).where(eq(users.id, userId));
    if (previous?.key) await this.storage.delete(previous.key);
    return this.users.getMe(userId);
  }

  private async reencode(upload: Buffer): Promise<Buffer> {
    try {
      const input = sharp(upload, { limitInputPixels: 40_000_000, failOn: 'error' });
      const { format } = await input.metadata();
      if (!format || !ACCEPTED_FORMATS.has(format)) throw INVALID_IMAGE();
      // sharp drops EXIF/XMP/ICC metadata unless asked to keep it; .rotate() applies EXIF orientation first.
      return await input
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw INVALID_IMAGE();
    }
  }
}
