import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, resetDatabase, type TestUser } from './support/app';
import { createOrganization, type OrgFixture, orgWithEveryRole } from './support/workspaces';

describe('teams and reference sync', () => {
  let app: INestApplication;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const base = () => `/api/v1/workspaces/${org.workspaceId}`;
  const as = (user: TestUser) => bearer(user.accessToken);

  async function rosterMember(name: string, workspace = org.workspaceId, user = org.users.SCORER) {
    const res = await http()
      .post(`/api/v1/workspaces/${workspace}/roster-members`)
      .set(as(user))
      .send({ displayName: name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function team(name: string) {
    const res = await http()
      .post(`${base()}/teams`)
      .set(as(org.users.SCORER))
      .send({ name, sportKeys: ['cricket'] })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  it('creates teams with case-insensitively unique names', async () => {
    await team('Sunrise XI');
    const res = await http()
      .post(`${base()}/teams`)
      .set(as(org.users.SCORER))
      .send({ name: 'sunrise xi' })
      .expect(409);
    expect(res.body.error.details).toEqual([{ field: 'name', code: 'TEAM_NAME_TAKEN' }]);
    await http()
      .post(`${base()}/teams`)
      .set(as(org.users.VIEWER))
      .send({ name: 'Viewers XI' })
      .expect(403);
  });

  it('adds and removes members and counts them', async () => {
    const teamId = await team('Sunrise XI');
    const [a, b] = await Promise.all([rosterMember('Anil'), rosterMember('Bala')]);
    const added = await http()
      .post(`${base()}/teams/${teamId}/members`)
      .set(as(org.users.SCORER))
      .send({ rosterMemberIds: [a, b, a] })
      .expect(200);
    expect(
      added.body.data.members.map(
        (m: { rosterMember: { displayName: string } }) => m.rosterMember.displayName,
      ),
    ).toEqual(['Anil', 'Bala']);
    const anil = added.body.data.members[0].id;

    const removed = await http()
      .delete(`${base()}/teams/${teamId}/members/${anil}`)
      .set(as(org.users.SCORER))
      .expect(200);
    expect(removed.body.data.members).toHaveLength(1);
    const list = await http().get(`${base()}/teams`).set(as(org.users.VIEWER)).expect(200);
    expect(list.body.data[0]).toMatchObject({
      name: 'Sunrise XI',
      memberCount: 1,
      sportKeys: ['cricket'],
    });
  });

  it('archiving a roster member takes them off every team', async () => {
    const teamId = await team('Sunrise XI');
    const anil = await rosterMember('Anil');
    await http()
      .post(`${base()}/teams/${teamId}/members`)
      .set(as(org.users.SCORER))
      .send({ rosterMemberIds: [anil] })
      .expect(200);
    await http().delete(`${base()}/roster-members/${anil}`).set(as(org.users.SCORER)).expect(204);
    const detail = await http()
      .get(`${base()}/teams/${teamId}`)
      .set(as(org.users.SCORER))
      .expect(200);
    expect(detail.body.data.members).toEqual([]);
  });

  it("won't put another workspace's roster member on a team", async () => {
    const teamId = await team('Sunrise XI');
    const otherOrg = await createOrganization(app, org.users.OUTSIDER, 'Rivals');
    const theirs = await rosterMember('Spy', otherOrg, org.users.OUTSIDER);
    const res = await http()
      .post(`${base()}/teams/${teamId}/members`)
      .set(as(org.users.SCORER))
      .send({ rosterMemberIds: [theirs] })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { field: 'rosterMemberIds', code: 'UNKNOWN_ROSTER_MEMBER' },
    ]);
  });

  describe('reference sync', () => {
    it('gives a second scorer the whole roster, then only changes', async () => {
      const teamId = await team('Sunrise XI');
      const anil = await rosterMember('Anil');
      await http()
        .post(`${base()}/teams/${teamId}/members`)
        .set(as(org.users.SCORER))
        .send({ rosterMemberIds: [anil] })
        .expect(200);

      // The cursor overlaps the last 5 s on purpose; let earlier writes fall outside it.
      await new Promise((resolve) => setTimeout(resolve, 5_200));

      // The viewer is a different person on a different device.
      const full = await http().get('/api/v1/sync/reference').set(as(org.users.VIEWER)).expect(200);
      expect(full.body.data.workspaces.map((w: { name: string }) => w.name)).toEqual([
        'Personal',
        'Sunrise Cricket Club',
      ]);
      expect(full.body.data.teams.map((t: { name: string }) => t.name)).toEqual(['Sunrise XI']);
      expect(
        full.body.data.rosterMembers.map((m: { displayName: string }) => m.displayName),
      ).toEqual(['Anil']);
      expect(full.body.data.teamMembers).toHaveLength(1);

      const cursor = full.body.data.cursor;
      const unchanged = await http()
        .get('/api/v1/sync/reference')
        .query({ since: cursor })
        .set(as(org.users.VIEWER))
        .expect(200);
      expect(unchanged.body.data.teams).toEqual([]);

      await http().delete(`${base()}/teams/${teamId}`).set(as(org.users.SCORER)).expect(204);
      const bala = await rosterMember('Bala');
      const delta = await http()
        .get('/api/v1/sync/reference')
        .query({ since: cursor })
        .set(as(org.users.VIEWER))
        .expect(200);
      expect(delta.body.data.teams).toEqual([
        expect.objectContaining({ id: teamId, archived: true }),
      ]);
      expect(delta.body.data.rosterMembers.map((m: { id: string }) => m.id)).toEqual([bala]);
    }, 20_000);

    it("never includes workspaces the user doesn't belong to", async () => {
      await createOrganization(app, org.users.OUTSIDER, 'Rivals');
      await rosterMember('Anil');
      const outsider = await http()
        .get('/api/v1/sync/reference')
        .set(as(org.users.OUTSIDER))
        .expect(200);
      expect(outsider.body.data.workspaces.map((w: { name: string }) => w.name)).toEqual([
        'Personal',
        'Rivals',
      ]);
      expect(outsider.body.data.rosterMembers).toEqual([]);
    });

    it('rejects a malformed cursor', async () => {
      const user = await registerUser(app);
      await http()
        .get('/api/v1/sync/reference')
        .query({ since: 'yesterday' })
        .set(as(user))
        .expect(400);
    });
  });
});
