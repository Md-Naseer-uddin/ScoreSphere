import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, registerUser, resetDatabase } from './support/app';
import {
  type Actor,
  createOrganization,
  invite,
  type OrgFixture,
  orgWithEveryRole,
} from './support/workspaces';

describe('workspaces', () => {
  let app: INestApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get<Pool>(PG_POOL);
  });
  afterAll(() => app.close());

  describe('authorization matrix', () => {
    let org: OrgFixture;

    beforeAll(async () => {
      await resetDatabase(app);
      org = await orgWithEveryRole(app);
    });

    type Case = {
      name: string;
      min: Exclude<Actor, 'OUTSIDER'>;
      ok: number;
      call: (token: string | null) => request.Test;
    };
    const send =
      (method: 'get' | 'post' | 'patch' | 'delete', path: () => string, body?: object) =>
      (token: string | null) => {
        const req = http()[method](path());
        if (token) req.set(bearer(token));
        return body ? req.send(body) : req;
      };

    const cases: Case[] = [
      {
        name: 'read workspace',
        min: 'VIEWER',
        ok: 200,
        call: send('get', () => `/api/v1/workspaces/${org.workspaceId}`),
      },
      {
        name: 'list members',
        min: 'VIEWER',
        ok: 200,
        call: send('get', () => `/api/v1/workspaces/${org.workspaceId}/members`),
      },
      {
        name: 'update workspace',
        min: 'ADMIN',
        ok: 200,
        call: send('patch', () => `/api/v1/workspaces/${org.workspaceId}`, {
          description: 'Weekend league',
        }),
      },
      {
        name: 'create invitation',
        min: 'ADMIN',
        ok: 201,
        call: send('post', () => `/api/v1/workspaces/${org.workspaceId}/invitations`, {
          role: 'VIEWER',
        }),
      },
      {
        name: 'list invitations',
        min: 'ADMIN',
        ok: 200,
        call: send('get', () => `/api/v1/workspaces/${org.workspaceId}/invitations`),
      },
      {
        name: 'change a member role',
        min: 'ADMIN',
        ok: 200,
        call: send(
          'patch',
          () => `/api/v1/workspaces/${org.workspaceId}/members/${org.membershipIds.VIEWER}`,
          {
            role: 'VIEWER',
          },
        ),
      },
    ];

    const RANK = { OWNER: 4, ADMIN: 3, SCORER: 2, VIEWER: 1 } as const;
    const actors: Actor[] = ['OWNER', 'ADMIN', 'SCORER', 'VIEWER', 'OUTSIDER'];

    for (const c of cases) {
      it(`${c.name}: anonymous callers get 401`, async () => {
        await c.call(null).expect(401);
      });
      for (const actor of actors) {
        const expected = actor === 'OUTSIDER' ? 404 : RANK[actor] >= RANK[c.min] ? c.ok : 403;
        it(`${c.name}: ${actor} gets ${expected}`, async () => {
          await c.call(org.users[actor].accessToken).expect(expected);
        });
      }
    }
  });

  describe('organizations', () => {
    beforeEach(() => resetDatabase(app));

    it('lists the personal workspace first, then organizations', async () => {
      const user = await registerUser(app);
      await createOrganization(app, user, 'Zeta Academy');
      await createOrganization(app, user, 'Alpha School');
      const res = await http().get('/api/v1/workspaces').set(bearer(user.accessToken)).expect(200);
      expect(res.body.data.map((w: { name: string; role: string }) => [w.name, w.role])).toEqual([
        ['Personal', 'OWNER'],
        ['Alpha School', 'OWNER'],
        ['Zeta Academy', 'OWNER'],
      ]);
    });

    it('generates unique slugs and rejects a taken explicit slug', async () => {
      const user = await registerUser(app);
      await createOrganization(app, user, 'Sunrise Club');
      await createOrganization(app, user, 'Sunrise Club');
      const { rows } = await pool.query('select slug from organizations order by created_at');
      expect(rows.map((r) => r.slug)).toEqual(['sunrise-club', 'sunrise-club-2']);

      const res = await http()
        .post('/api/v1/organizations')
        .set(bearer(user.accessToken))
        .send({ name: 'Another', slug: 'sunrise-club' })
        .expect(409);
      expect(res.body.error.details).toEqual([{ field: 'slug', code: 'SLUG_TAKEN' }]);
    });

    it('does not allow invitations to a personal workspace', async () => {
      const user = await registerUser(app);
      const list = await http().get('/api/v1/workspaces').set(bearer(user.accessToken)).expect(200);
      await http()
        .post(`/api/v1/workspaces/${list.body.data[0].id}/invitations`)
        .set(bearer(user.accessToken))
        .send({ role: 'VIEWER' })
        .expect(400);
    });

    it('keeps workspaces isolated from each other', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const orgA = await createOrganization(app, a, 'Team A');
      await createOrganization(app, b, 'Team B');
      await http().get(`/api/v1/workspaces/${orgA}`).set(bearer(b.accessToken)).expect(404);
      await http().get(`/api/v1/workspaces/${orgA}/members`).set(bearer(b.accessToken)).expect(404);
    });
  });

  describe('invitations', () => {
    beforeEach(() => resetDatabase(app));

    async function newInvitation(
      owner: Awaited<ReturnType<typeof registerUser>>,
      workspaceId: string,
      role = 'SCORER',
    ) {
      const res = await http()
        .post(`/api/v1/workspaces/${workspaceId}/invitations`)
        .set(bearer(owner.accessToken))
        .send({ role })
        .expect(201);
      return res.body.data as { id: string; token: string };
    }

    it('previews and accepts a link once', async () => {
      const owner = await registerUser(app, { displayName: 'Coach' });
      const joiner = await registerUser(app, { displayName: 'Kiran' });
      const workspaceId = await createOrganization(app, owner, 'Riverside College');
      const { token } = await newInvitation(owner, workspaceId);

      const preview = await http()
        .post('/api/v1/invitations/preview')
        .set(bearer(joiner.accessToken))
        .send({ token })
        .expect(200);
      expect(preview.body.data).toEqual({
        workspaceName: 'Riverside College',
        role: 'SCORER',
        alreadyMember: false,
      });

      const accepted = await http()
        .post('/api/v1/invitations/accept')
        .set(bearer(joiner.accessToken))
        .send({ token })
        .expect(200);
      expect(accepted.body.data).toMatchObject({ id: workspaceId, role: 'SCORER' });

      const other = await registerUser(app);
      await http()
        .post('/api/v1/invitations/accept')
        .set(bearer(other.accessToken))
        .send({ token })
        .expect(404);
    });

    it('rejects expired and revoked links', async () => {
      const owner = await registerUser(app);
      const joiner = await registerUser(app);
      const workspaceId = await createOrganization(app, owner);

      const expired = await newInvitation(owner, workspaceId);
      await pool.query(
        "update workspace_invitations set expires_at = now() - interval '1 minute' where id = $1",
        [expired.id],
      );
      await http()
        .post('/api/v1/invitations/accept')
        .set(bearer(joiner.accessToken))
        .send({ token: expired.token })
        .expect(404);

      const revoked = await newInvitation(owner, workspaceId);
      await http()
        .delete(`/api/v1/workspaces/${workspaceId}/invitations/${revoked.id}`)
        .set(bearer(owner.accessToken))
        .expect(204);
      await http()
        .post('/api/v1/invitations/accept')
        .set(bearer(joiner.accessToken))
        .send({ token: revoked.token })
        .expect(404);

      const pending = await http()
        .get(`/api/v1/workspaces/${workspaceId}/invitations`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(pending.body.data).toEqual([]);
    });

    it('keeps an existing member’s role when they accept another link', async () => {
      const owner = await registerUser(app);
      const member = await registerUser(app);
      const workspaceId = await createOrganization(app, owner);
      await invite(app, workspaceId, owner, member, 'SCORER');
      const { token } = await newInvitation(owner, workspaceId, 'VIEWER');
      const res = await http()
        .post('/api/v1/invitations/accept')
        .set(bearer(member.accessToken))
        .send({ token })
        .expect(200);
      expect(res.body.data.role).toBe('SCORER');
    });

    it('lets only owners invite admins', async () => {
      const org = await orgWithEveryRole(app);
      await http()
        .post(`/api/v1/workspaces/${org.workspaceId}/invitations`)
        .set(bearer(org.users.ADMIN.accessToken))
        .send({ role: 'ADMIN' })
        .expect(403);
      await http()
        .post(`/api/v1/workspaces/${org.workspaceId}/invitations`)
        .set(bearer(org.users.OWNER.accessToken))
        .send({ role: 'ADMIN' })
        .expect(201);
    });
  });

  describe('roles and membership', () => {
    let org: OrgFixture;
    beforeEach(async () => {
      await resetDatabase(app);
      org = await orgWithEveryRole(app);
    });

    const changeRole = (actor: Actor, membershipId: string, role: string) =>
      http()
        .patch(`/api/v1/workspaces/${org.workspaceId}/members/${membershipId}`)
        .set(bearer(org.users[actor].accessToken))
        .send({ role });

    it('reserves owner changes for owners and audits role changes', async () => {
      await changeRole('ADMIN', org.membershipIds.SCORER, 'OWNER').expect(403);
      await changeRole('ADMIN', org.membershipIds.OWNER, 'VIEWER').expect(403);
      await changeRole('ADMIN', org.membershipIds.SCORER, 'VIEWER').expect(200);
      await changeRole('OWNER', org.membershipIds.ADMIN, 'OWNER').expect(200);

      const { rows } = await pool.query(
        "select metadata from audit_logs where action = 'membership.role_changed' order by created_at",
      );
      expect(rows.map((r) => r.metadata)).toEqual([
        { from: 'SCORER', to: 'VIEWER' },
        { from: 'ADMIN', to: 'OWNER' },
      ]);
    });

    it('never leaves a workspace without an owner', async () => {
      const res = await changeRole('OWNER', org.membershipIds.OWNER, 'ADMIN').expect(409);
      expect(res.body.error.details).toEqual([{ field: 'role', code: 'LAST_OWNER' }]);
      await http()
        .delete(`/api/v1/workspaces/${org.workspaceId}/members/${org.membershipIds.OWNER}`)
        .set(bearer(org.users.OWNER.accessToken))
        .expect(409);
    });

    it('lets members leave but only admins remove others', async () => {
      const remove = (actor: Actor, membershipId: string) =>
        http()
          .delete(`/api/v1/workspaces/${org.workspaceId}/members/${membershipId}`)
          .set(bearer(org.users[actor].accessToken));

      await remove('VIEWER', org.membershipIds.SCORER).expect(403);
      await remove('ADMIN', org.membershipIds.OWNER).expect(403);
      await remove('ADMIN', org.membershipIds.SCORER).expect(204);
      await http()
        .get(`/api/v1/workspaces/${org.workspaceId}`)
        .set(bearer(org.users.SCORER.accessToken))
        .expect(404);

      await remove('VIEWER', org.membershipIds.VIEWER).expect(204);
      const members = await http()
        .get(`/api/v1/workspaces/${org.workspaceId}/members`)
        .set(bearer(org.users.OWNER.accessToken))
        .expect(200);
      expect(members.body.data.map((m: { role: string }) => m.role).sort()).toEqual([
        'ADMIN',
        'OWNER',
      ]);
    });

    it('lets a removed member rejoin through a new invitation', async () => {
      await http()
        .delete(`/api/v1/workspaces/${org.workspaceId}/members/${org.membershipIds.VIEWER}`)
        .set(bearer(org.users.VIEWER.accessToken))
        .expect(204);
      await invite(app, org.workspaceId, org.users.OWNER, org.users.VIEWER, 'SCORER');
      const res = await http()
        .get(`/api/v1/workspaces/${org.workspaceId}`)
        .set(bearer(org.users.VIEWER.accessToken))
        .expect(200);
      expect(res.body.data.role).toBe('SCORER');
    });
  });
});
