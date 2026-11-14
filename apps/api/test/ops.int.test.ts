import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, resetDatabase } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { createOrganization } from './support/workspaces';

const METRICS_TOKEN = 'metrics-token-for-tests-1234';

describe('operations endpoints', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      METRICS_TOKEN,
      MIN_CLIENT_VERSION: '0.2.0',
      LATEST_CLIENT_VERSION: '0.3.1',
      APK_URL: 'https://downloads.scoresphere.test/scoresphere-0.3.1.apk',
      APK_SHA256: 'a'.repeat(64),
    });
    await resetDatabase(app);
  });
  afterAll(() => app.close());

  it('hides metrics without the token', async () => {
    await http().get('/api/v1/metrics').expect(404);
    await http().get('/api/v1/metrics').set('Authorization', 'Bearer wrong').expect(404);
  });

  it('reports matches, refused events and open streams', async () => {
    const user = await registerUser(app);
    const org = await createOrganization(app, user);
    const match = new DeviceMatch(org);
    await postEvents(app, user, match, match.opening(), { withHeader: true });
    match.seq += 1;
    await postEvents(app, user, match, [match.rally(0)]);

    const res = await http()
      .get('/api/v1/metrics')
      .set('Authorization', `Bearer ${METRICS_TOKEN}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('scoresphere_matches{status="live"} 1');
    expect(res.text).toContain('scoresphere_event_rejections_total{code="SEQ_GAP"} 1');
    expect(res.text).toContain('scoresphere_match_events_total 3');
    expect(res.text).toMatch(/scoresphere_sse_connections \d+/);
    // Metrics never carry personal data.
    expect(res.text).not.toContain(user.phone);
  });

  it('tells clients the minimum version and the latest release', async () => {
    const res = await http().get('/api/v1/app/version').expect(200);
    expect(res.body.data).toEqual({
      minClientVersion: '0.2.0',
      latestVersion: '0.3.1',
      apk: {
        url: 'https://downloads.scoresphere.test/scoresphere-0.3.1.apk',
        sha256: 'a'.repeat(64),
      },
      releaseNotesUrl: null,
    });
  });
});
