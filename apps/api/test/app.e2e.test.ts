import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { errorEnvelopeSchema } from '@scoresphere/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PG_POOL } from '../src/database/database.module';

/** Stands in for pg.Pool so these HTTP tests don't need a database. */
const fakePool = {
  healthy: true,
  async query() {
    if (!this.healthy) throw new Error('connection refused');
    return { rows: [{ '?column?': 1 }] };
  },
  async end() {},
};

describe('HTTP pipeline', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-unit';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(fakePool)
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps liveness in the success envelope and issues a request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes a well-formed incoming request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'trace-abc_123')
      .expect(200);
    expect(res.body.meta.requestId).toBe('trace-abc_123');
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'bad id with spaces')
      .expect(200);
    expect(res.body.meta.requestId).not.toBe('bad id with spaces');
  });

  it('reports readiness when the database answers', async () => {
    fakePool.healthy = true;
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.data.checks.database).toBe('ok');
  });

  it('returns 503 in the error envelope when the database is down', async () => {
    fakePool.healthy = false;
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('SERVICE_UNAVAILABLE');
    fakePool.healthy = true;
  });

  it('returns NOT_FOUND in the error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
