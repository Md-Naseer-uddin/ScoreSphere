import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, registerUser, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { createOrganization, invite } from './support/workspaces';

describe('account data rights', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);

  async function personalWorkspace(user: TestUser) {
    const res = await http().get('/api/v1/workspaces').set(as(user)).expect(200);
    return res.body.data.find((w: { type: string }) => w.type === 'PERSONAL').id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('exports the user’s own data', async () => {
    const user = await registerUser(app, { displayName: 'Asha' });
    await createOrganization(app, user, 'Hill View School');
    const res = await http().get('/api/v1/me/export').set(as(user)).expect(200);
    expect(res.body.data.profile).toMatchObject({ displayName: 'Asha', phone: `+91${user.phone}` });
    expect(res.body.data.workspaces.map((w: { name: string }) => w.name)).toContain(
      'Hill View School',
    );
    expect(res.body.data.devices).toHaveLength(1);
    expect(res.body.data.activity.length).toBeGreaterThan(0);
  });

  it('erases the account: no sign-in, the number is free again, organisation records stay', async () => {
    const user = await registerUser(app, { displayName: 'Asha', password: 'asha password 1' });
    const workspace = await personalWorkspace(user);
    // Personal data with teams and roster members, to check everything goes with it.
    const member = await http()
      .post(`/api/v1/workspaces/${workspace}/roster-members`)
      .set(as(user))
      .send({ displayName: 'Ravi' })
      .expect(201);
    const team = await http()
      .post(`/api/v1/workspaces/${workspace}/teams`)
      .set(as(user))
      .send({ name: 'Weekend XI' })
      .expect(201);
    await http()
      .post(`/api/v1/workspaces/${workspace}/teams/${team.body.data.id}/members`)
      .set(as(user))
      .send({ rosterMemberIds: [member.body.data.id] })
      .expect(200);
    const match = new DeviceMatch(workspace);
    await postEvents(app, user, match, match.opening(), { withHeader: true });

    const owner = await registerUser(app, { displayName: 'Coach' });
    const org = await createOrganization(app, owner, 'Club');
    await invite(app, org, owner, user, 'SCORER');

    await http().post('/api/v1/me/deletion').set(as(user)).send({ password: 'wrong' }).expect(400);
    await http()
      .post('/api/v1/me/deletion')
      .set(as(user))
      .send({ password: 'asha password 1' })
      .expect(204);

    await http()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: 'asha password 1', device: user.device })
      .expect(401);
    await http().get('/api/v1/me').set(as(user)).expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.refreshCookie)
      .send({})
      .expect(401);

    const db = app.get<Pool>(PG_POOL);
    const { rows } = await db.query(
      'select display_name, status, phone_identity_id, email from users where id = $1',
      [user.id],
    );
    expect(rows[0]).toEqual({
      display_name: 'Deleted user',
      status: 'DELETED',
      phone_identity_id: null,
      email: null,
    });
    expect((await db.query('select 1 from workspaces where id = $1', [workspace])).rowCount).toBe(
      0,
    );
    const members = await http()
      .get(`/api/v1/workspaces/${org}/members`)
      .set(as(owner))
      .expect(200);
    expect(members.body.data).toHaveLength(1);

    // A recycled number can sign up again as a new person.
    const again = await registerUser(app, { phone: user.phone, displayName: 'New owner' });
    expect(again.id).not.toBe(user.id);
  });

  it('keeps an organisation from losing its only owner while others use it', async () => {
    const owner = await registerUser(app, { password: 'owner password 1' });
    const org = await createOrganization(app, owner, 'Club');
    const scorer = await registerUser(app);
    await invite(app, org, owner, scorer, 'SCORER');
    const res = await http()
      .post('/api/v1/me/deletion')
      .set(as(owner))
      .send({ password: 'owner password 1' })
      .expect(409);
    expect(res.body.error.details).toEqual([{ field: 'workspace', code: 'LAST_OWNER' }]);

    // Alone in an organisation, deleting the account archives it.
    const solo = await registerUser(app, { password: 'solo password 1' });
    const soloOrg = await createOrganization(app, solo, 'Solo Club');
    await http()
      .post('/api/v1/me/deletion')
      .set(as(solo))
      .send({ password: 'solo password 1' })
      .expect(204);
    const { rows } = await app
      .get<Pool>(PG_POOL)
      .query('select archived_at from workspaces where id = $1', [soloOrg]);
    expect(rows[0].archived_at).not.toBeNull();
  });
});
