import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import {
  bearer,
  createTestApp,
  deviceInfo,
  refreshCookieFrom,
  registerUser,
  resetDatabase,
  uniquePhone,
} from './support/app';

describe('auth', () => {
  let app: INestApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get<Pool>(PG_POOL);
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  describe('register', () => {
    it('creates the account, a personal workspace and a web session cookie', async () => {
      const phone = uniquePhone();
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          phone,
          password: 'long enough pw',
          displayName: 'Asha',
          adultConfirmed: true,
          device: deviceInfo(),
        })
        .expect(201);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
      const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('ss_rt='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/SameSite=Strict/);

      const { rows } = await pool.query(
        `select w.type, m.role from workspaces w join workspace_memberships m on m.workspace_id = w.id
         where m.user_id = $1`,
        [res.body.data.user.id],
      );
      expect(rows).toEqual([{ type: 'PERSONAL', role: 'OWNER' }]);

      const stored = await pool.query('select phone_e164, verified_at from phone_identities');
      expect(stored.rows).toEqual([{ phone_e164: `+91${phone}`, verified_at: null }]);
    });

    it('returns the refresh token in the body for Android instead of a cookie', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          phone: uniquePhone(),
          password: 'long enough pw',
          displayName: 'Ravi',
          adultConfirmed: true,
          device: deviceInfo('ANDROID'),
        })
        .expect(201);
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a number that is already registered, in any format', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          phone: `+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}`,
          password: 'another password',
          displayName: 'Someone',
          adultConfirmed: true,
          device: deviceInfo(),
        })
        .expect(409);
      expect(res.body.error.details).toEqual([{ field: 'phone', code: 'PHONE_TAKEN' }]);
    });

    it('validates phone, password length and the 18+ confirmation', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          phone: '12345',
          password: 'short',
          displayName: 'X',
          adultConfirmed: false,
          device: deviceInfo(),
        })
        .expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['phone', 'password', 'adultConfirmed']));
    });
  });

  describe('login', () => {
    it('signs in with phone and password', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: user.password, device: deviceInfo() })
        .expect(200);
      expect(res.body.data.user.id).toBe(user.id);
      expect(refreshCookieFrom(res.headers['set-cookie'])).not.toBe('');
    });

    it('gives the same answer for an unknown phone and a wrong password', async () => {
      const user = await registerUser(app);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: 'not the password', device: deviceInfo() })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ phone: uniquePhone(), password: 'not the password', device: deviceInfo() })
        .expect(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
    });

    it('locks the account after five failed attempts', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ phone: user.phone, password: 'wrong password', device: deviceInfo() })
          .expect(401);
      }
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: user.password, device: deviceInfo() })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('sessions', () => {
    it('requires a valid access token on protected routes', async () => {
      await http().get('/api/v1/me').expect(401);
      await http().get('/api/v1/me').set(bearer('not-a-jwt')).expect(401);
      const user = await registerUser(app);
      await http().get('/api/v1/me').set(bearer(user.accessToken)).expect(200);
    });

    it('rotates the web refresh cookie', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);
      const next = refreshCookieFrom(res.headers['set-cookie']);
      expect(next).not.toBe('');
      expect(next).not.toBe(user.refreshCookie);
      await http().get('/api/v1/me').set(bearer(res.body.data.accessToken)).expect(200);
    });

    it('rotates an Android refresh token sent in the body', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          phone: uniquePhone(),
          password: 'long enough pw',
          displayName: 'Ravi',
          adultConfirmed: true,
          device: deviceInfo('ANDROID'),
        })
        .expect(201);
      const rotated = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: res.body.data.refreshToken })
        .expect(200);
      expect(rotated.body.data.refreshToken).not.toBe(res.body.data.refreshToken);
    });

    it('treats an immediate replay as a race but revokes the family on later reuse', async () => {
      const user = await registerUser(app);
      const first = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);
      const latest = refreshCookieFrom(first.headers['set-cookie']);

      // Within the grace window the old token fails, but the session family survives.
      await http().post('/api/v1/auth/refresh').set('Cookie', user.refreshCookie).expect(401);
      await http().get('/api/v1/me').set(bearer(first.body.data.accessToken)).expect(200);

      // Outside the window, replaying a rotated token looks like theft: everything is revoked.
      await pool.query(
        "update auth_sessions set rotated_at = now() - interval '5 minutes' where rotated_at is not null",
      );
      await http().post('/api/v1/auth/refresh').set('Cookie', user.refreshCookie).expect(401);
      await http().post('/api/v1/auth/refresh').set('Cookie', latest).expect(401);
      await http().get('/api/v1/me').set(bearer(first.body.data.accessToken)).expect(401);
    });

    it('logout revokes the refresh token and the access token', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', user.refreshCookie)
        .expect(204);
      expect([res.headers['set-cookie']].flat().join()).toMatch(/ss_rt=;/);
      await http().post('/api/v1/auth/refresh').set('Cookie', user.refreshCookie).expect(401);
      await http().get('/api/v1/me').set(bearer(user.accessToken)).expect(401);
    });
  });

  describe('password reset with a recovery code', () => {
    it('sets a new password, rotates the code and signs out everywhere', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/password/reset')
        .send({
          phone: user.phone,
          recoveryCode: user.recoveryCode.toLowerCase(),
          newPassword: 'brand new password',
        })
        .expect(200);
      const newCode = res.body.data.recoveryCode;
      expect(newCode).not.toBe(user.recoveryCode);

      await http().get('/api/v1/me').set(bearer(user.accessToken)).expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: user.password, device: deviceInfo() })
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: 'brand new password', device: deviceInfo() })
        .expect(200);

      // The old code is single-use.
      await http()
        .post('/api/v1/auth/password/reset')
        .send({
          phone: user.phone,
          recoveryCode: user.recoveryCode,
          newPassword: 'yet another one',
        })
        .expect(400);
    });

    it('rejects a wrong code without revealing whether the phone exists', async () => {
      const user = await registerUser(app);
      const body = { recoveryCode: '0000-0000-0000-0000', newPassword: 'brand new password' };
      const wrong = await http()
        .post('/api/v1/auth/password/reset')
        .send({ ...body, phone: user.phone })
        .expect(400);
      const unknown = await http()
        .post('/api/v1/auth/password/reset')
        .send({ ...body, phone: uniquePhone() })
        .expect(400);
      expect(wrong.body.error).toEqual(unknown.body.error);
    });
  });
});

describe('auth rate limits', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_ENABLED: 'true' });
    await resetDatabase(app);
  });
  afterAll(() => app.close());

  it('limits registrations per client', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/v1/auth/register').send({
        phone: uniquePhone(),
        password: 'long enough pw',
        displayName: 'A',
        adultConfirmed: true,
        device: deviceInfo(),
      });
    for (let i = 0; i < 5; i++) await attempt().expect(201);
    const res = await attempt().expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
