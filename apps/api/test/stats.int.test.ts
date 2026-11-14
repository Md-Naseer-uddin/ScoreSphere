import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { type OrgFixture, orgWithEveryRole } from './support/workspaces';

const quick = {
  discipline: 'singles',
  pointsToWin: 3,
  winBy: 1,
  cap: 3,
  gamesToWin: 1,
  intervalAt: null,
  deciderChangeEndsAt: null,
};

describe('player and team statistics', () => {
  let app: INestApplication;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const scorer = () => org.users.SCORER;
  const base = () => `/api/v1/workspaces/${org.workspaceId}`;

  async function member(name: string) {
    const res = await http()
      .post(`${base()}/roster-members`)
      .set(as(scorer()))
      .send({ displayName: name })
      .expect(201);
    return res.body.data.id as string;
  }

  /** A quick game between two roster members; `winner` 0 is the first. */
  async function game(a: string, b: string, winner: 0 | 1, teamId: string | null = null) {
    const match = new DeviceMatch(org.workspaceId, [a, b], { config: quick, presetKey: 'quick' });
    match.header.sides[0]!.teamId = teamId;
    await postEvents(
      app,
      scorer(),
      match,
      [...match.opening(), match.rally(winner), match.rally(winner), match.rally(winner)],
      {
        withHeader: true,
      },
    );
    return match;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  it('sums a player’s completed matches by sport', async () => {
    const asha = await member('Asha');
    const ravi = await member('Ravi');
    await game(asha, ravi, 0);
    await game(asha, ravi, 1);
    const unfinished = new DeviceMatch(org.workspaceId, [asha, ravi], {
      config: quick,
      presetKey: 'quick',
    });
    await postEvents(app, scorer(), unfinished, unfinished.opening(), { withHeader: true });

    const res = await http()
      .get(`${base()}/roster-members/${asha}/stats`)
      .set(as(org.users.VIEWER))
      .expect(200);
    expect(res.body.data).toMatchObject({
      displayName: 'Asha',
      sports: [{ sport: 'badminton', played: 2, won: 1, lost: 1, drawn: 0 }],
    });
    expect(res.body.data.sports[0].metrics.service_points_won).toBeGreaterThan(0);
    expect(res.body.data.recent.map((r: { result: string }) => r.result).sort()).toEqual([
      'lost',
      'won',
    ]);
  });

  it('gives a team its record', async () => {
    const asha = await member('Asha');
    const ravi = await member('Ravi');
    const team = await http()
      .post(`${base()}/teams`)
      .set(as(scorer()))
      .send({ name: 'Club' })
      .expect(201);
    await game(asha, ravi, 0, team.body.data.id);
    const res = await http()
      .get(`${base()}/teams/${team.body.data.id}/stats`)
      .set(as(org.users.VIEWER))
      .expect(200);
    expect(res.body.data.sports).toEqual([
      expect.objectContaining({ sport: 'badminton', played: 1, won: 1 }),
    ]);
    expect(res.body.data.sports[0].metrics.games_won).toBe(1);
  });

  it('keeps statistics inside the workspace', async () => {
    const asha = await member('Asha');
    await http()
      .get(`${base()}/roster-members/${asha}/stats`)
      .set(as(org.users.OUTSIDER))
      .expect(404);
    const res = await http().get('/api/v1/me/stats').set(as(org.users.OUTSIDER)).expect(200);
    expect(res.body.data.sports).toEqual([]);
  });
});
