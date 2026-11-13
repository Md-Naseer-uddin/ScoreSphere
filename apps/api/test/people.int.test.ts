import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import {
  bearer,
  createTestApp,
  registerUser,
  resetDatabase,
  type TestUser,
  uniquePhone,
} from './support/app';
import { type OrgFixture, orgWithEveryRole } from './support/workspaces';

describe('people and rosters', () => {
  let app: INestApplication;
  let pool: Pool;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const base = () => `/api/v1/workspaces/${org.workspaceId}`;
  const as = (user: TestUser) => bearer(user.accessToken);

  const lookup = (phone: string, user = org.users.SCORER) =>
    http().post(`${base()}/people/lookup`).set(as(user)).send({ phone });
  const addMember = (body: object, user = org.users.SCORER) =>
    http().post(`${base()}/roster-members`).set(as(user)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get<Pool>(PG_POOL);
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  describe('phone lookup', () => {
    it('answers identically for a private account and an unknown number', async () => {
      const privateUser = await registerUser(app);
      const forPrivate = await lookup(privateUser.phone).expect(200);
      const forUnknown = await lookup(uniquePhone()).expect(200);
      expect(forPrivate.body.data).toEqual({ result: 'INVITE' });
      expect(forUnknown.body.data).toEqual(forPrivate.body.data);
    });

    it('shows a discoverable account’s name and photo but never the number', async () => {
      const visible = await registerUser(app, { displayName: 'Ravi' });
      await http()
        .patch('/api/v1/me')
        .set(as(visible))
        .send({ discoverableByPhone: true })
        .expect(200);
      const res = await lookup(visible.phone).expect(200);
      expect(res.body.data).toMatchObject({
        result: 'DISCOVERABLE',
        person: { displayName: 'Ravi', avatarUrl: null },
      });
      expect(JSON.stringify(res.body)).not.toContain(visible.phone);
    });

    it('always finds the caller themselves', async () => {
      const res = await lookup(org.users.SCORER.phone).expect(200);
      expect(res.body.data.result).toBe('DISCOVERABLE');
    });

    it('reports numbers already on the roster', async () => {
      const phone = uniquePhone();
      const added = await addMember({ displayName: 'Ravi', link: { phone } }).expect(201);
      const res = await lookup(phone).expect(200);
      expect(res.body.data).toEqual({ result: 'ON_ROSTER', rosterMemberId: added.body.data.id });
    });

    it('is limited to scorers and above', async () => {
      await lookup(uniquePhone(), org.users.VIEWER).expect(403);
      await lookup(uniquePhone(), org.users.OUTSIDER).expect(404);
    });
  });

  describe('roster members', () => {
    it('adds name-only members that other scorers can see', async () => {
      const res = await addMember({ displayName: 'Anil', jerseyNumber: '7' }).expect(201);
      expect(res.body.data).toMatchObject({
        displayName: 'Anil',
        jerseyNumber: '7',
        link: 'NONE',
        archived: false,
      });
      const list = await http()
        .get(`${base()}/roster-members`)
        .set(as(org.users.VIEWER))
        .expect(200);
      expect(list.body.data.map((m: { displayName: string }) => m.displayName)).toEqual(['Anil']);
      await addMember({ displayName: 'Nope' }, org.users.VIEWER).expect(403);
    });

    it('gives the same INVITED result for private accounts and unknown numbers', async () => {
      const privateUser = await registerUser(app);
      const a = await addMember({
        displayName: 'Private',
        link: { phone: privateUser.phone },
      }).expect(201);
      const b = await addMember({ displayName: 'Unknown', link: { phone: uniquePhone() } }).expect(
        201,
      );
      const shape = (m: Record<string, unknown>) => ({
        ...m,
        id: null,
        displayName: null,
        updatedAt: null,
      });
      expect(shape(a.body.data)).toEqual(shape(b.body.data));
      expect(a.body.data.link).toBe('INVITED');
    });

    it('links a discoverable person straight away but refuses a private one by id', async () => {
      const visible = await registerUser(app);
      await http()
        .patch('/api/v1/me')
        .set(as(visible))
        .send({ discoverableByPhone: true })
        .expect(200);
      const found = await lookup(visible.phone).expect(200);
      const personId = found.body.data.person.id;
      const res = await addMember({ displayName: 'Visible', link: { personId } }).expect(201);
      expect(res.body.data.link).toBe('LINKED');
      await addMember({ displayName: 'Again', link: { personId } }).expect(409);

      await http()
        .patch('/api/v1/me')
        .set(as(visible))
        .send({ discoverableByPhone: false })
        .expect(200);
      const other = await registerUser(app);
      await http()
        .patch('/api/v1/me')
        .set(as(other))
        .send({ discoverableByPhone: true })
        .expect(200);
      const otherPerson = (await lookup(other.phone).expect(200)).body.data.person.id;
      await http()
        .patch('/api/v1/me')
        .set(as(other))
        .send({ discoverableByPhone: false })
        .expect(200);
      const refused = await addMember({
        displayName: 'Hidden',
        link: { personId: otherPerson },
      }).expect(400);
      expect(refused.body.error.details).toEqual([{ field: 'link', code: 'PERSON_NOT_AVAILABLE' }]);
    });

    it('requires exactly one of person or phone when linking', async () => {
      await addMember({ displayName: 'X', link: {} }).expect(400);
    });
  });

  describe('claiming a pending profile (ADR 0013, 0025)', () => {
    it('links the same person after sign-up, user confirmation and admin approval', async () => {
      const phone = uniquePhone();
      const added = await addMember({ displayName: 'Ravi K', link: { phone } }).expect(201);
      const rosterMemberId = added.body.data.id;

      const ravi = await registerUser(app, { phone, displayName: 'Ravi Kumar' });
      const invites = await http().get('/api/v1/me/roster-links').set(as(ravi)).expect(200);
      expect(invites.body.data).toEqual([
        expect.objectContaining({
          rosterMemberId,
          workspaceName: 'Sunrise Cricket Club',
          nameUsed: 'Ravi K',
          state: 'INVITED',
        }),
      ]);

      const accepted = await http()
        .post(`/api/v1/me/roster-links/${rosterMemberId}/accept`)
        .set(as(ravi))
        .expect(200);
      expect(accepted.body.data[0].state).toBe('AWAITING_APPROVAL');

      const pending = await http()
        .get(`${base()}/roster-members`)
        .set(as(org.users.ADMIN))
        .expect(200);
      expect(pending.body.data[0]).toMatchObject({
        link: 'AWAITING_APPROVAL',
        claimantName: 'Ravi Kumar',
      });

      await http()
        .post(`${base()}/roster-members/${rosterMemberId}/approve-claim`)
        .set(as(org.users.SCORER))
        .expect(403);
      const approved = await http()
        .post(`${base()}/roster-members/${rosterMemberId}/approve-claim`)
        .set(as(org.users.ADMIN))
        .expect(200);
      expect(approved.body.data).toMatchObject({ link: 'LINKED', claimantName: null });

      // One person for that number, owned by Ravi's account, and it's the one on the roster.
      const { rows } = await pool.query(
        `select p.id, p.user_id, p.status, r.person_id from persons p
         join phone_identities i on i.id = p.phone_identity_id
         left join roster_members r on r.person_id = p.id
         where i.phone_e164 = $1`,
        [`+91${phone}`],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: ravi.id, status: 'CLAIMED' });
      expect(rows[0].person_id).toBe(rows[0].id);
      expect(
        (await http().get('/api/v1/me/roster-links').set(as(ravi)).expect(200)).body.data,
      ).toEqual([]);
    });

    it('lets an existing account accept an invitation without admin approval', async () => {
      const privateUser = await registerUser(app);
      const added = await addMember({
        displayName: 'Meera',
        link: { phone: privateUser.phone },
      }).expect(201);
      await http()
        .post(`/api/v1/me/roster-links/${added.body.data.id}/accept`)
        .set(as(privateUser))
        .expect(200);
      const list = await http()
        .get(`${base()}/roster-members`)
        .set(as(org.users.SCORER))
        .expect(200);
      expect(list.body.data[0].link).toBe('LINKED');
    });

    it('unlinks when the person says "not me" or the admin rejects the claim', async () => {
      const phone = uniquePhone();
      const declined = await addMember({ displayName: 'Wrong number', link: { phone } }).expect(
        201,
      );
      const user = await registerUser(app, { phone });
      await http()
        .post(`/api/v1/me/roster-links/${declined.body.data.id}/decline`)
        .set(as(user))
        .expect(200);

      const phone2 = uniquePhone();
      const rejected = await addMember({
        displayName: 'Impostor check',
        link: { phone: phone2 },
      }).expect(201);
      const claimant = await registerUser(app, { phone: phone2 });
      await http()
        .post(`/api/v1/me/roster-links/${rejected.body.data.id}/accept`)
        .set(as(claimant))
        .expect(200);
      await http()
        .post(`${base()}/roster-members/${rejected.body.data.id}/reject-claim`)
        .set(as(org.users.OWNER))
        .expect(200);

      const list = await http()
        .get(`${base()}/roster-members`)
        .set(as(org.users.SCORER))
        .expect(200);
      expect(list.body.data.map((m: { link: string }) => m.link)).toEqual(['NONE', 'NONE']);
    });

    it("can't act on someone else's invitation", async () => {
      const added = await addMember({ displayName: 'Ravi', link: { phone: uniquePhone() } }).expect(
        201,
      );
      const stranger = await registerUser(app);
      await http()
        .post(`/api/v1/me/roster-links/${added.body.data.id}/accept`)
        .set(as(stranger))
        .expect(404);
    });

    it('links a name-only member once their number is known', async () => {
      const added = await addMember({ displayName: 'Anil' }).expect(201);
      const res = await http()
        .post(`${base()}/roster-members/${added.body.data.id}/link`)
        .set(as(org.users.SCORER))
        .send({ phone: uniquePhone() })
        .expect(200);
      expect(res.body.data.link).toBe('INVITED');
    });
  });
});
