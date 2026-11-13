import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, registerUser, type TestUser } from './app';

export type Actor = 'OWNER' | 'ADMIN' | 'SCORER' | 'VIEWER' | 'OUTSIDER';

export interface OrgFixture {
  workspaceId: string;
  users: Record<Actor, TestUser>;
  membershipIds: Record<Exclude<Actor, 'OUTSIDER'>, string>;
}

export async function createOrganization(
  app: INestApplication,
  owner: TestUser,
  name = 'Sunrise Cricket Club',
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set(bearer(owner.accessToken))
    .send({ name })
    .expect(201);
  return res.body.data.id as string;
}

/** Creates an invitation as `inviter` and accepts it as `invitee`. */
export async function invite(
  app: INestApplication,
  workspaceId: string,
  inviter: TestUser,
  invitee: TestUser,
  role: 'ADMIN' | 'SCORER' | 'VIEWER',
) {
  const created = await request(app.getHttpServer())
    .post(`/api/v1/workspaces/${workspaceId}/invitations`)
    .set(bearer(inviter.accessToken))
    .send({ role })
    .expect(201);
  await request(app.getHttpServer())
    .post('/api/v1/invitations/accept')
    .set(bearer(invitee.accessToken))
    .send({ token: created.body.data.token })
    .expect(200);
}

/** An organization with one member in each role, plus an outsider. */
export async function orgWithEveryRole(app: INestApplication): Promise<OrgFixture> {
  const [owner, admin, scorer, viewer, outsider] = await Promise.all(
    ['Owner', 'Admin', 'Scorer', 'Viewer', 'Outsider'].map((displayName) =>
      registerUser(app, { displayName }),
    ),
  );
  const workspaceId = await createOrganization(app, owner!);
  await invite(app, workspaceId, owner!, admin!, 'ADMIN');
  await invite(app, workspaceId, owner!, scorer!, 'SCORER');
  await invite(app, workspaceId, owner!, viewer!, 'VIEWER');

  const members = await request(app.getHttpServer())
    .get(`/api/v1/workspaces/${workspaceId}/members`)
    .set(bearer(owner!.accessToken))
    .expect(200);
  const byUser = new Map<string, string>(
    members.body.data.map((m: { userId: string; membershipId: string }) => [
      m.userId,
      m.membershipId,
    ]),
  );
  return {
    workspaceId,
    users: { OWNER: owner!, ADMIN: admin!, SCORER: scorer!, VIEWER: viewer!, OUTSIDER: outsider! },
    membershipIds: {
      OWNER: byUser.get(owner!.id)!,
      ADMIN: byUser.get(admin!.id)!,
      SCORER: byUser.get(scorer!.id)!,
      VIEWER: byUser.get(viewer!.id)!,
    },
  };
}
