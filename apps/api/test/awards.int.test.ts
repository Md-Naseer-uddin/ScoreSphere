import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { type OrgFixture, orgWithEveryRole } from './support/workspaces';

describe('match awards', () => {
  let app: INestApplication;
  let org: OrgFixture;
  let match: DeviceMatch;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const scorer = () => org.users.SCORER;
  const awards = async (user = scorer()) =>
    (await http().get(`/api/v1/matches/${match.matchId}/awards`).set(as(user)).expect(200)).body
      .data;

  /** Asha wins 21–0, 21–0. Returns the seq of the winning rally. */
  async function playToCompletion() {
    match = new DeviceMatch(org.workspaceId);
    await postEvents(app, scorer(), match, match.opening(), { withHeader: true });
    await postEvents(app, scorer(), match, [
      ...Array.from({ length: 21 }, () => match.rally(0)),
      match.startGame(0),
    ]);
    await postEvents(
      app,
      scorer(),
      match,
      Array.from({ length: 21 }, () => match.rally(0)),
    );
    return match.seq;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  it('publishes the automatic award when the match is complete, and withdraws it if reopened', async () => {
    const winningSeq = await playToCompletion();
    const [award] = await awards(org.users.VIEWER);
    expect(award).toMatchObject({
      awardKey: 'player-of-the-match',
      status: 'PUBLISHED',
      provenance: 'AUTO',
      recipients: [{ participantId: match.players[0], side: 0, displayName: 'Asha' }],
      metrics: { games_won: 2, points_won: 42, longest_streak: 21 },
    });

    await postEvents(app, scorer(), match, [match.undo(winningSeq)]);
    expect(await awards()).toEqual([]);
    await postEvents(app, scorer(), match, [match.rally(0)]);
    expect(await awards()).toHaveLength(1);
  });

  it('lets an admin override with a reason, audited, and marks it stale if the match changes', async () => {
    const winningSeq = await playToCompletion();
    const path = `/api/v1/matches/${match.matchId}/awards/player-of-the-match`;
    const body = { participantIds: [match.players[1]], reason: null };

    await http().put(path).set(as(scorer())).send(body).expect(403);
    await http().put(path).set(as(org.users.OUTSIDER)).send(body).expect(404);
    const missing = await http().put(path).set(as(org.users.ADMIN)).send(body).expect(400);
    expect(missing.body.error.details).toEqual([{ field: 'reason', code: 'REQUIRED' }]);

    const res = await http()
      .put(path)
      .set(as(org.users.ADMIN))
      .send({ ...body, reason: 'Outstanding sportsmanship' })
      .expect(200);
    expect(res.body.data[0]).toMatchObject({
      provenance: 'OVERRIDE',
      status: 'PUBLISHED',
      reason: 'Outstanding sportsmanship',
      recipients: [{ displayName: 'Ravi' }],
    });
    const audit = await app
      .get<Pool>(PG_POOL)
      .query("select action from audit_logs where entity_id = $1 and action like 'award.%'", [
        match.matchId,
      ]);
    expect(audit.rows).toEqual([{ action: 'award.selected' }]);

    // A correction after the choice: the organizer's pick stays, flagged for review.
    await postEvents(app, scorer(), match, [match.undo(winningSeq), match.rally(0)]);
    expect((await awards())[0]).toMatchObject({ provenance: 'OVERRIDE', status: 'STALE' });

    // Reverting brings back the automatic award.
    const reverted = await http().delete(path).set(as(org.users.ADMIN)).expect(200);
    expect(reverted.body.data[0]).toMatchObject({
      provenance: 'AUTO',
      recipients: [{ displayName: 'Asha' }],
    });
  });

  it('refuses players from outside the match and unknown awards', async () => {
    await playToCompletion();
    const other = new DeviceMatch(org.workspaceId);
    await http()
      .put(`/api/v1/matches/${match.matchId}/awards/player-of-the-match`)
      .set(as(org.users.ADMIN))
      .send({ participantIds: [other.players[0]], reason: 'x' })
      .expect(400);
    await http()
      .put(`/api/v1/matches/${match.matchId}/awards/best-bowler`)
      .set(as(org.users.ADMIN))
      .send({ participantIds: [match.players[0]], reason: 'x' })
      .expect(404);
  });
});
