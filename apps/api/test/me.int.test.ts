import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  deviceInfo,
  registerUser,
  resetDatabase,
  uniquePhone,
} from './support/app';

describe('/me', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('returns the profile with the phone masked and never in full', async () => {
    const user = await registerUser(app, { displayName: 'Asha' });
    const res = await http().get('/api/v1/me').set(bearer(user.accessToken)).expect(200);
    expect(res.body.data).toMatchObject({
      id: user.id,
      displayName: 'Asha',
      phoneMasked: `+91 ••••••${user.phone.slice(-4)}`,
      discoverableByPhone: false,
      avatarUrl: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(user.phone);
  });

  it('updates profile fields and clears optional ones with empty strings', async () => {
    const user = await registerUser(app);
    await http()
      .patch('/api/v1/me')
      .set(bearer(user.accessToken))
      .send({ fullName: 'Asha Rao', city: 'Pune', discoverableByPhone: true })
      .expect(200);
    const res = await http()
      .patch('/api/v1/me')
      .set(bearer(user.accessToken))
      .send({ city: '' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      fullName: 'Asha Rao',
      city: null,
      discoverableByPhone: true,
    });
  });

  it('changes the password and signs out other sessions only', async () => {
    const user = await registerUser(app);
    const other = await http()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: user.password, device: deviceInfo() })
      .expect(200);

    await http()
      .post('/api/v1/me/password')
      .set(bearer(user.accessToken))
      .send({ currentPassword: 'wrong', newPassword: 'a new password' })
      .expect(400);
    await http()
      .post('/api/v1/me/password')
      .set(bearer(user.accessToken))
      .send({ currentPassword: user.password, newPassword: 'a new password' })
      .expect(204);

    await http().get('/api/v1/me').set(bearer(user.accessToken)).expect(200);
    await http().get('/api/v1/me').set(bearer(other.body.data.accessToken)).expect(401);
  });

  it('changes the phone number to an unused one', async () => {
    const user = await registerUser(app);
    const taken = await registerUser(app);
    const newPhone = uniquePhone();

    const conflict = await http()
      .post('/api/v1/me/phone')
      .set(bearer(user.accessToken))
      .send({ currentPassword: user.password, newPhone: taken.phone })
      .expect(409);
    expect(conflict.body.error.details).toEqual([{ field: 'newPhone', code: 'PHONE_TAKEN' }]);

    const res = await http()
      .post('/api/v1/me/phone')
      .set(bearer(user.accessToken))
      .send({ currentPassword: user.password, newPhone })
      .expect(200);
    expect(res.body.data.phoneMasked).toBe(`+91 ••••••${newPhone.slice(-4)}`);

    await http()
      .post('/api/v1/auth/login')
      .send({ phone: newPhone, password: user.password, device: deviceInfo() })
      .expect(200);
    await http()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: user.password, device: deviceInfo() })
      .expect(401);
  });

  it('regenerates the recovery code only with the current password', async () => {
    const user = await registerUser(app);
    await http()
      .post('/api/v1/me/recovery-code')
      .set(bearer(user.accessToken))
      .send({ currentPassword: 'wrong' })
      .expect(400);
    const res = await http()
      .post('/api/v1/me/recovery-code')
      .set(bearer(user.accessToken))
      .send({ currentPassword: user.password })
      .expect(200);
    expect(res.body.data.recoveryCode).not.toBe(user.recoveryCode);
  });

  it('lists devices and signs one out', async () => {
    const user = await registerUser(app);
    const otherDevice = deviceInfo('ANDROID');
    const other = await http()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: user.password, device: otherDevice })
      .expect(200);

    const list = await http().get('/api/v1/me/devices').set(bearer(user.accessToken)).expect(200);
    expect(list.body.data).toHaveLength(2);
    const current = list.body.data.find((d: { current: boolean }) => d.current);
    const android = list.body.data.find((d: { platform: string }) => d.platform === 'ANDROID');
    expect(current.platform).toBe('WEB');

    await http()
      .delete(`/api/v1/me/devices/${android.id}`)
      .set(bearer(user.accessToken))
      .expect(204);
    await http().get('/api/v1/me').set(bearer(other.body.data.accessToken)).expect(401);
    const after = await http().get('/api/v1/me/devices').set(bearer(user.accessToken)).expect(200);
    expect(after.body.data).toHaveLength(1);
  });

  it("can't revoke another user's device", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const devices = await http().get('/api/v1/me/devices').set(bearer(b.accessToken)).expect(200);
    await http()
      .delete(`/api/v1/me/devices/${devices.body.data[0].id}`)
      .set(bearer(a.accessToken))
      .expect(404);
  });
});
