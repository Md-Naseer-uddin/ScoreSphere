import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, resetDatabase } from './support/app';

async function photo(format: 'jpeg' | 'png' = 'jpeg', width = 1200, height = 900): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  });
  // Embed EXIF (a stand-in for camera/GPS data) to prove it gets stripped.
  return image
    .withExif({ IFD0: { Copyright: 'secret-location' } })
    [format]()
    .toBuffer();
}

describe('avatars', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('re-encodes an upload to a 512px WebP without metadata and serves it', async () => {
    const user = await registerUser(app);
    const res = await http()
      .put('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .attach('file', await photo(), { filename: 'me.jpg', contentType: 'image/jpeg' })
      .expect(200);
    const avatarUrl: string = res.body.data.avatarUrl;
    expect(avatarUrl).toMatch(/^\/media\/avatars\/[0-9a-f-]+\.webp$/);

    const image = await http().get(`/api/v1${avatarUrl}`).expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toContain('immutable');
    const meta = await sharp(image.body as Buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
    expect(meta.exif).toBeUndefined();
  });

  it('judges the file by its content, not its name or MIME type', async () => {
    const user = await registerUser(app);
    const res = await http()
      .put('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(res.body.error.details).toEqual([{ field: 'file', code: 'INVALID_IMAGE' }]);
  });

  it('rejects files over 5 MB', async () => {
    const user = await registerUser(app);
    await http()
      .put('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);
  });

  it('replaces and removes the avatar, deleting old files', async () => {
    const user = await registerUser(app);
    const first = await http()
      .put('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .attach('file', await photo('png'), 'a.png')
      .expect(200);
    const second = await http()
      .put('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .attach('file', await photo('jpeg'), 'b.jpg')
      .expect(200);
    await http().get(`/api/v1${first.body.data.avatarUrl}`).expect(404);

    const removed = await http()
      .delete('/api/v1/me/avatar')
      .set(bearer(user.accessToken))
      .expect(200);
    expect(removed.body.data.avatarUrl).toBeNull();
    await http().get(`/api/v1${second.body.data.avatarUrl}`).expect(404);
  });

  it('refuses media paths that are not generated avatar keys', async () => {
    await http().get('/api/v1/media/avatars/..%2F..%2Fetc%2Fpasswd').expect(404);
    await http().get('/api/v1/media/avatars/not-a-key.webp').expect(404);
  });
});
