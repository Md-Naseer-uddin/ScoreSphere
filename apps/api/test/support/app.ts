import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@scoresphere/contracts';
import type { Pool } from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PG_POOL } from '../../src/database/database.module';

/** Boots the real application against the integration database. */
export async function createTestApp(env: Record<string, string> = {}): Promise<INestApplication> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: 'integration-test-secret-integration-test',
    RATE_LIMIT_ENABLED: 'false',
    STORAGE_DIR: mkdtempSync(join(tmpdir(), 'scoresphere-media-')),
    ...env,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

/** Empties every application table between tests. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const pool = app.get<Pool>(PG_POOL);
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  await pool.query(
    `truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`,
  );
}

let phoneCounter = 0;

/** A unique, valid Indian mobile number per call within a run. */
export function uniquePhone(): string {
  phoneCounter += 1;
  return `9${String(Date.now() % 1e5).padStart(5, '0')}${String(phoneCounter).padStart(4, '0')}`;
}

export function deviceInfo(platform: 'WEB' | 'ANDROID' = 'WEB') {
  return { deviceId: newId(), platform, appVersion: '0.0.0-test' };
}

export interface TestUser {
  id: string;
  phone: string;
  password: string;
  accessToken: string;
  refreshCookie: string;
  recoveryCode: string;
  device: ReturnType<typeof deviceInfo>;
}

/** Registers a web user and returns its credentials. */
export async function registerUser(
  app: INestApplication,
  overrides: { phone?: string; password?: string; displayName?: string } = {},
): Promise<TestUser> {
  const phone = overrides.phone ?? uniquePhone();
  const password = overrides.password ?? 'correct horse battery';
  const device = deviceInfo();
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      phone,
      password,
      displayName: overrides.displayName ?? 'Asha',
      adultConfirmed: true,
      device,
    })
    .expect(201);
  return {
    id: res.body.data.user.id,
    phone,
    password,
    accessToken: res.body.data.accessToken,
    refreshCookie: refreshCookieFrom(res.headers['set-cookie']),
    recoveryCode: res.body.data.recoveryCode,
    device,
  };
}

/** Extracts `ss_rt=<token>` from a Set-Cookie header for replaying in later requests. */
export function refreshCookieFrom(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith('ss_rt='));
  return cookie ? cookie.split(';')[0]! : '';
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
