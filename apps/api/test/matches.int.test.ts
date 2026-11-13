import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { createOrganization, type OrgFixture, orgWithEveryRole } from './support/workspaces';

describe('match ledger and sync', () => {
  let app: INestApplication;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const scorer = () => org.users.SCORER;

  async function newMatch(user = scorer()) {
    const match = new DeviceMatch(org.workspaceId);
    const res = await postEvents(app, user, match, match.opening(), { withHeader: true });
    expect(res.results.map((r) => r.outcome)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    return match;
  }

  const detail = async (match: DeviceMatch, user = scorer()) =>
    (await http().get(`/api/v1/matches/${match.matchId}`).set(as(user)).expect(200)).body.data;

  const rejections = async (matchId: string) =>
    (
      await app
        .get<Pool>(PG_POOL)
        .query(
          'select seq, outcome, code from match_event_rejections where match_id = $1 order by seq',
          [matchId],
        )
    ).rows;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  it('materialises a match created on a device and projects its state', async () => {
    const match = await newMatch();
    const res = await postEvents(app, scorer(), match, [
      match.rally(0),
      match.rally(0),
      match.rally(1),
    ]);
    expect(res).toMatchObject({ version: 6, leaseEpoch: 1, needsReview: false });

    const m = await detail(match);
    expect(m).toMatchObject({
      sport: 'badminton',
      status: 'live',
      version: 6,
      leaseDeviceId: match.deviceId,
      result: { status: 'in_progress', summary: '2–1' },
    });
    expect(m.sides[0].participants).toEqual([
      { participantId: match.players[0], displayName: 'Asha', rosterMemberId: null },
    ]);
    expect(m.events.map((e: { seq: number }) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.startedAt).not.toBeNull();
  });

  it('treats a retried batch as already processed and never scores twice', async () => {
    const match = await newMatch();
    const batch = [match.rally(0), match.rally(1)];
    await postEvents(app, scorer(), match, batch);
    const retry = await postEvents(app, scorer(), match, batch);
    expect(retry.results.map((r) => [r.seq, r.outcome])).toEqual([
      [4, 'ALREADY_PROCESSED'],
      [5, 'ALREADY_PROCESSED'],
    ]);
    expect(retry.version).toBe(5);
    expect((await detail(match)).result.summary).toBe('1–1');
  });

  it('accepts a retried creation batch without duplicating the match', async () => {
    const match = new DeviceMatch(org.workspaceId);
    const opening = match.opening();
    await postEvents(app, scorer(), match, opening, { withHeader: true });
    const retry = await postEvents(app, scorer(), match, opening, { withHeader: true });
    expect(retry.results.every((r) => r.outcome === 'ALREADY_PROCESSED')).toBe(true);
    const list = await http()
      .get(`/api/v1/workspaces/${org.workspaceId}/matches`)
      .set(as(org.users.VIEWER))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('returns 404 for events to an unknown match without a header', async () => {
    const match = new DeviceMatch(org.workspaceId);
    await postEvents(app, scorer(), match, [match.created()], { expect: 404 });
  });

  it('refuses gaps and keeps the refused events', async () => {
    const match = await newMatch();
    match.seq += 1; // the device lost event 4
    const res = await postEvents(app, scorer(), match, [match.rally(0)]);
    expect(res.results[0]).toMatchObject({ seq: 5, outcome: 'REJECTED', code: 'SEQ_GAP' });
    expect(await rejections(match.matchId)).toEqual([
      { seq: 5, outcome: 'REJECTED', code: 'SEQ_GAP' },
    ]);
  });

  it('rejects malformed commands and other engine versions', async () => {
    const match = await newMatch();
    let res = await postEvents(app, scorer(), match, [
      match.event({ kind: 'COMMAND', payload: { type: 'smash' } }),
    ]);
    expect(res.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'BAD_PAYLOAD' });
    match.seq = 3;
    const wrongEngine = { ...match.rally(0), engineVersion: 2 };
    res = await postEvents(app, scorer(), match, [wrongEngine]);
    expect(res.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'ENGINE_VERSION_MISMATCH' });
  });

  it('accepts and flags an event the server engine rejects (ADR 0009)', async () => {
    const match = new DeviceMatch(org.workspaceId);
    // A rally before the game is opened: the engine refuses it, but it is kept.
    const res = await postEvents(
      app,
      scorer(),
      match,
      [match.created(), match.start(), match.rally(0)],
      {
        withHeader: true,
      },
    );
    expect(res.results.map((r) => r.outcome)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    expect(res.needsReview).toBe(true);
    const m = await detail(match);
    expect(m).toMatchObject({ needsReview: true, version: 3 });
    // Scoring continues on top of the flagged event.
    const more = await postEvents(app, scorer(), match, [match.startGame(0), match.rally(1)]);
    expect(more.results.map((r) => r.outcome)).toEqual(['ACCEPTED', 'ACCEPTED']);
    expect((await detail(match)).result.summary).toBe('0–1');
  });

  it('applies undo through VOID', async () => {
    const match = await newMatch();
    await postEvents(app, scorer(), match, [match.rally(0), match.rally(0)]);
    await postEvents(app, scorer(), match, [match.undo(5)]);
    expect((await detail(match)).result.summary).toBe('1–0');
  });

  it('completes the match and records the result', async () => {
    const match = await newMatch();
    const game1 = Array.from({ length: 21 }, () => match.rally(0));
    await postEvents(app, scorer(), match, [...game1, match.startGame(0)]);
    await postEvents(
      app,
      scorer(),
      match,
      Array.from({ length: 21 }, () => match.rally(0)),
    );
    const m = await detail(match);
    expect(m).toMatchObject({
      status: 'completed',
      result: { status: 'won', winnerSide: 0, summary: '21–0, 21–0' },
    });
    expect(m.endedAt).not.toBeNull();
  });

  describe('authorization', () => {
    it('lets viewers read but not score', async () => {
      const match = await newMatch();
      await detail(match, org.users.VIEWER);
      const viewerMatch = new DeviceMatch(org.workspaceId);
      await postEvents(app, org.users.VIEWER, viewerMatch, viewerMatch.opening(), {
        withHeader: true,
        expect: 403,
      });
      match.deviceId = org.users.VIEWER.device.deviceId;
      await postEvents(app, org.users.VIEWER, match, [match.rally(0)], { expect: 403 });
    });

    it('hides matches from outsiders', async () => {
      const match = await newMatch();
      const outsider = org.users.OUTSIDER;
      await http().get(`/api/v1/matches/${match.matchId}`).set(as(outsider)).expect(404);
      await http().get(`/api/v1/matches/${match.matchId}/events`).set(as(outsider)).expect(404);
      await http()
        .get(`/api/v1/workspaces/${org.workspaceId}/matches`)
        .set(as(outsider))
        .expect(404);
      await postEvents(app, outsider, match, [match.rally(0)], { expect: 404 });
      await http()
        .post(`/api/v1/matches/${match.matchId}/lease`)
        .set(as(outsider))
        .send({ deviceId: 'outsider-device', action: 'TAKEOVER' })
        .expect(404);
      const intoOrg = new DeviceMatch(org.workspaceId);
      await postEvents(app, outsider, intoOrg, intoOrg.opening(), {
        withHeader: true,
        expect: 404,
      });
    });

    it('refuses roster members from another workspace', async () => {
      const other = await createOrganization(app, org.users.OUTSIDER, 'Other Club');
      const foreign = await http()
        .post(`/api/v1/workspaces/${other}/roster-members`)
        .set(as(org.users.OUTSIDER))
        .send({ displayName: 'Imran' })
        .expect(201);
      const match = new DeviceMatch(org.workspaceId, [foreign.body.data.id, null]);
      const res = await http()
        .post(`/api/v1/matches/${match.matchId}/events`)
        .set(as(scorer()))
        .send({ deviceId: match.deviceId, match: match.header, events: match.opening() })
        .expect(400);
      expect(res.body.error.details).toEqual([{ field: 'match', code: 'UNKNOWN_ROSTER_MEMBER' }]);
    });
  });

  describe('scorer lease', () => {
    const lease = (
      user: TestUser,
      matchId: string,
      deviceId: string,
      action: string,
      status = 200,
    ) =>
      http()
        .post(`/api/v1/matches/${matchId}/lease`)
        .set(as(user))
        .send({ deviceId, action })
        .expect(status);

    it('keeps one scoring device and fences off the old one after a takeover', async () => {
      const match = await newMatch();
      // A second device can't simply claim it.
      await lease(org.users.ADMIN, match.matchId, 'tablet-device-1', 'CLAIM', 409);
      // Another scorer can't take it over; an admin can.
      await lease(org.users.OWNER, match.matchId, 'phone-device-2', 'HEARTBEAT', 409);
      const other = new DeviceMatch(org.workspaceId);
      await lease(org.users.VIEWER, match.matchId, other.deviceId, 'TAKEOVER', 403);
      const taken = await lease(org.users.ADMIN, match.matchId, 'tablet-device-1', 'TAKEOVER');
      expect(taken.body.data).toEqual({
        leaseEpoch: 2,
        leaseDeviceId: 'tablet-device-1',
        version: 3,
      });

      // The old device, still offline, sends what it scored: refused and kept.
      const stale = await postEvents(app, scorer(), match, [match.rally(0), match.rally(0)]);
      expect(stale.results.map((r) => [r.outcome, r.code])).toEqual([
        ['CONFLICT', 'NOT_LEASE_HOLDER'],
        ['CONFLICT', 'NOT_LEASE_HOLDER'],
      ]);
      expect(await rejections(match.matchId)).toHaveLength(2);

      // The new device continues from the server's ledger under epoch 2.
      const tablet = Object.assign(new DeviceMatch(org.workspaceId), {
        matchId: match.matchId,
        deviceId: 'tablet-device-1',
        epoch: 2,
        seq: 3,
      });
      const res = await postEvents(app, org.users.ADMIN, tablet, [tablet.rally(1)]);
      expect(res.results[0]).toMatchObject({ outcome: 'ACCEPTED', seq: 4 });
      expect((await detail(match)).result.summary).toBe('0–1');
    });

    it('lets the scorer move their own match to another device', async () => {
      const match = await newMatch();
      const res = await lease(scorer(), match.matchId, 'scorer-new-phone', 'TAKEOVER');
      expect(res.body.data.leaseEpoch).toBe(2);
    });

    it('hands over through release and claim, bumping the epoch', async () => {
      const match = await newMatch();
      await lease(scorer(), match.matchId, match.deviceId, 'RELEASE');
      let m = await detail(match);
      expect(m.leaseDeviceId).toBeNull();
      const res = await lease(org.users.VIEWER, match.matchId, 'viewer-device', 'CLAIM', 403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      await lease(org.users.OWNER, match.matchId, 'owner-device-1', 'CLAIM');
      m = await detail(match);
      expect(m).toMatchObject({ leaseEpoch: 2, leaseDeviceId: 'owner-device-1' });
      // The releasing device's late events are refused.
      const late = await postEvents(app, scorer(), match, [match.rally(0)]);
      expect(late.results[0]).toMatchObject({ outcome: 'CONFLICT', code: 'NOT_LEASE_HOLDER' });
    });
  });
});
