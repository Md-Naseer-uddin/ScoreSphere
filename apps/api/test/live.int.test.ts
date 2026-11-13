import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { SseStream } from './support/sse';
import { type OrgFixture, orgWithEveryRole } from './support/workspaces';

describe('live sharing', () => {
  let app: INestApplication;
  let baseUrl: string;
  let org: OrgFixture;
  let match: DeviceMatch;
  const streams: SseStream[] = [];
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const scorer = () => org.users.SCORER;

  async function shareLink(user = scorer(), expiresInHours: number | null = null) {
    const res = await http()
      .post(`/api/v1/matches/${match.matchId}/share-links`)
      .set(as(user))
      .send({ expiresInHours })
      .expect(201);
    return res.body.data as { id: string; token: string; active: boolean };
  }

  async function open(path: string, headers: Record<string, string>) {
    const stream = await SseStream.open(`${baseUrl}${path}`, headers);
    streams.push(stream);
    return stream;
  }

  const publicStream = (token: string, lastEventId?: number) =>
    open('/api/v1/public/live/stream', {
      'x-share-token': token,
      ...(lastEventId ? { 'last-event-id': String(lastEventId) } : {}),
    });

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
    match = new DeviceMatch(org.workspaceId);
    await postEvents(app, scorer(), match, match.opening(), { withHeader: true });
  });
  afterEach(() => {
    for (const s of streams.splice(0)) s.close();
  });
  afterAll(() => app.close());

  it('creates share links for scorers only and never lists the token again', async () => {
    const link = await shareLink();
    expect(link.token.length).toBeGreaterThanOrEqual(40);
    expect(link.active).toBe(true);
    const list = await http()
      .get(`/api/v1/matches/${match.matchId}/share-links`)
      .set(as(scorer()))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('token');
    await http()
      .post(`/api/v1/matches/${match.matchId}/share-links`)
      .set(as(org.users.VIEWER))
      .send({ expiresInHours: null })
      .expect(403);
    await http()
      .post(`/api/v1/matches/${match.matchId}/share-links`)
      .set(as(org.users.OUTSIDER))
      .send({ expiresInHours: null })
      .expect(404);
  });

  it('shows spectators names and the ledger, but no internal IDs', async () => {
    const { token } = await shareLink();
    const res = await http().get('/api/v1/public/live').set('x-share-token', token).expect(200);
    const snap = res.body.data;
    expect(Object.keys(snap).sort()).toEqual(
      [
        'events',
        'engineVersion',
        'matchId',
        'scorerSeenAt',
        'sides',
        'sport',
        'status',
        'title',
        'version',
      ].sort(),
    );
    expect(snap.sides[0]).toEqual({
      side: 0,
      name: 'Asha',
      participants: [{ participantId: match.players[0], displayName: 'Asha' }],
    });
    expect(snap.events.map((e: { seq: number }) => e.seq)).toEqual([1, 2, 3]);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('refuses missing and unknown tokens', async () => {
    await http().get('/api/v1/public/live').expect(404);
    const res = await http().get('/api/v1/public/live').set('x-share-token', 'nope').expect(404);
    expect(res.body.error.details).toEqual([{ field: 'token', code: 'LINK_INVALID' }]);
  });

  it('streams a snapshot, then each committed change, and resumes from Last-Event-ID', async () => {
    const { token } = await shareLink();
    const stream = await publicStream(token);
    expect(stream.status).toBe(200);
    const first = await stream.next();
    expect(first).toMatchObject({ type: 'snapshot', id: '3' });

    await postEvents(app, scorer(), match, [match.rally(0)]);
    const delta = await stream.next();
    expect(delta).toMatchObject({ type: 'delta', id: '4', data: { version: 4, status: 'live' } });
    expect((delta!.data as { events: { seq: number }[] }).events.map((e) => e.seq)).toEqual([4]);

    await postEvents(app, scorer(), match, [match.rally(1)]);
    await stream.next();
    // A spectator who dropped after event 4 gets only what it missed.
    const resumed = await publicStream(token, 4);
    const catchUp = await resumed.next();
    expect(catchUp).toMatchObject({ type: 'delta', id: '5' });
    expect((catchUp!.data as { events: { seq: number }[] }).events.map((e) => e.seq)).toEqual([5]);
  });

  it('ends open streams when the link is revoked', async () => {
    const link = await shareLink();
    const stream = await publicStream(link.token);
    await stream.next();
    await http()
      .delete(`/api/v1/matches/${match.matchId}/share-links/${link.id}`)
      .set(as(scorer()))
      .expect(204);
    expect(await stream.next()).toMatchObject({ type: 'revoked' });
    expect(await stream.next()).toBeNull();
    const res = await http()
      .get('/api/v1/public/live')
      .set('x-share-token', link.token)
      .expect(404);
    expect(res.body.error.details[0].code).toBe('LINK_REVOKED');
  });

  it('stops honouring an expired link', async () => {
    const link = await shareLink(scorer(), 1);
    await app
      .get<Pool>(PG_POOL)
      .query(
        `update match_share_links set expires_at = now() - interval '1 minute' where id = $1`,
        [link.id],
      );
    const res = await http()
      .get('/api/v1/public/live')
      .set('x-share-token', link.token)
      .expect(404);
    expect(res.body.error.details[0].code).toBe('LINK_EXPIRED');
    const stream = await publicStream(link.token);
    expect(stream.status).toBe(404);
  });

  it('streams in-app to workspace members only', async () => {
    const viewer = await open(`/api/v1/matches/${match.matchId}/stream`, as(org.users.VIEWER));
    expect(await viewer.next()).toMatchObject({ type: 'snapshot' });
    const outsider = await open(`/api/v1/matches/${match.matchId}/stream`, as(org.users.OUTSIDER));
    expect(outsider.status).toBe(404);
    const anonymous = await open(`/api/v1/matches/${match.matchId}/stream`, {});
    expect(anonymous.status).toBe(401);
  });

  it('tells spectators when the scorer was last seen', async () => {
    const { token } = await shareLink();
    const stream = await publicStream(token);
    const first = (await stream.next())!.data as { scorerSeenAt: string };
    await http()
      .post(`/api/v1/matches/${match.matchId}/lease`)
      .set(as(scorer()))
      .send({ deviceId: match.deviceId, action: 'HEARTBEAT' })
      .expect(200);
    const delta = (await stream.next())!.data as { scorerSeenAt: string; events: unknown[] };
    expect(delta.events).toEqual([]);
    expect(new Date(delta.scorerSeenAt) >= new Date(first.scorerSeenAt)).toBe(true);
  });
});
