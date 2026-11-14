import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/database.module';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents, singles21 } from './support/matches';
import { type Actor, type OrgFixture, orgWithEveryRole } from './support/workspaces';

/** The plan's M8 example: three wides in a row give the batting side a penalty run. */
const threeWides = {
  id: 'three-wides',
  name: 'Three wides in a row',
  priority: 50,
  trigger: 'ball',
  conditions: [
    { source: 'fact', key: 'kind', op: 'eq', value: 'wide' },
    { source: 'state', key: 'consecutive_wides', op: 'gte', value: 3 },
  ],
  actions: [
    { command: 'penalty_runs', params: { runs: 1 } },
    { command: 'reset_wide_count', params: {} },
  ],
};

const gully = {
  playersPerSide: 6,
  oversPerInnings: 4,
  ballsPerOver: 6,
  maxOversPerBowler: null,
  allowConsecutiveOvers: true,
  wideRuns: 1,
  noBallRuns: 1,
  freeHit: false,
  lastManStands: true,
  sixAndOut: 'off',
  oneTipOneHand: false,
  consecutiveWides: null,
  superOver: 'off',
};

/** Badminton: three points in a row by the first side give the second side a point. */
const mercy = {
  id: 'mercy',
  name: 'Mercy point',
  priority: 0,
  trigger: 'point',
  conditions: [
    { source: 'fact', key: 'side', op: 'eq', value: 0 },
    { source: 'state', key: 'streak', op: 'eq', value: 3 },
  ],
  actions: [{ command: 'rally', params: { winner: 1 } }],
};

describe('rulesets', () => {
  let app: INestApplication;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const base = () => `/api/v1/workspaces/${org.workspaceId}/rulesets`;

  const save = (actor: Actor, body: Record<string, unknown>, expected: number) =>
    http()
      .post(base())
      .set(as(org.users[actor]))
      .send({
        name: 'Gully rules',
        sport: 'cricket',
        basePresetKey: 'gully',
        config: gully,
        rules: [threeWides],
        ...body,
      })
      .expect(expected);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    org = await orgWithEveryRole(app);
  });
  afterAll(() => app.close());

  it('saves a ruleset as version 1, and each change as a new version', async () => {
    const created = (await save('SCORER', {}, 201)).body.data;
    expect(created).toMatchObject({
      sport: 'cricket',
      name: 'Gully rules',
      archivedAt: null,
      latest: { version: 1, engineVersion: 1, basePresetKey: 'gully', rules: [threeWides] },
    });
    const changed = { ...threeWides, actions: [{ command: 'penalty_runs', params: { runs: 5 } }] };
    const next = await http()
      .post(`${base()}/${created.id}/versions`)
      .set(as(org.users.SCORER))
      .send({
        name: 'Gully rules (strict)',
        basePresetKey: 'gully',
        config: gully,
        rules: [changed],
      })
      .expect(201);
    expect(next.body.data).toMatchObject({ name: 'Gully rules (strict)', latest: { version: 2 } });

    const versions = await http()
      .get(`${base()}/${created.id}/versions`)
      .set(as(org.users.VIEWER))
      .expect(200);
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions.body.data[1].rules).toEqual([threeWides]);
  });

  it('blocks rules the sport does not support', async () => {
    const bad = { ...threeWides, actions: [{ command: 'add_wicket', params: {} }] };
    const res = await save('SCORER', { rules: [bad] }, 400);
    expect(res.body.error.details).toEqual([
      { field: 'rules.0.actions.0.command', code: 'UNKNOWN_COMMAND' },
    ]);
    const wrongField = {
      ...threeWides,
      conditions: [{ source: 'state', key: 'consecutive_wides', op: 'gte', value: 'three' }],
    };
    expect((await save('SCORER', { rules: [wrongField] }, 400)).body.error.details).toEqual([
      { field: 'rules.0.conditions.0.value', code: 'BAD_VALUE' },
    ]);
    await save('SCORER', { config: { ...gully, oversPerInnings: 0 } }, 400);
    const carrom = await save('SCORER', { sport: 'carrom' }, 400);
    expect(carrom.body.error.details).toEqual([{ field: 'sport', code: 'NOT_SUPPORTED' }]);
  });

  it('keeps names unique in a workspace', async () => {
    await save('SCORER', {}, 201);
    const res = await save('ADMIN', { name: 'gully RULES' }, 409);
    expect(res.body.error.details).toEqual([{ field: 'name', code: 'RULESET_NAME_TAKEN' }]);
  });

  it('lets viewers read, scorers save and admins archive', async () => {
    await save('VIEWER', {}, 403);
    await save('OUTSIDER', {}, 404);
    const id = (await save('SCORER', {}, 201)).body.data.id;
    await http().get(base()).set(as(org.users.OUTSIDER)).expect(404);
    await http().get(`${base()}/${id}/versions`).set(as(org.users.OUTSIDER)).expect(404);
    expect((await http().get(base()).set(as(org.users.VIEWER)).expect(200)).body.data).toHaveLength(
      1,
    );
    await http().delete(`${base()}/${id}`).set(as(org.users.SCORER)).expect(403);
    await http().delete(`${base()}/${id}`).set(as(org.users.ADMIN)).expect(204);
    expect((await http().get(base()).set(as(org.users.VIEWER)).expect(200)).body.data).toEqual([]);
    // An archived ruleset takes no new versions.
    await http()
      .post(`${base()}/${id}/versions`)
      .set(as(org.users.SCORER))
      .send({ name: 'Again', basePresetKey: 'gully', config: gully, rules: [] })
      .expect(404);
  });

  it('syncs rulesets to devices for offline matches, including archived ones', async () => {
    const id = (await save('SCORER', {}, 201)).body.data.id;
    const full = await http().get('/api/v1/sync/reference').set(as(org.users.VIEWER)).expect(200);
    expect(full.body.data.rulesets).toMatchObject([{ id, latest: { rules: [threeWides] } }]);
    await http().delete(`${base()}/${id}`).set(as(org.users.ADMIN)).expect(204);
    const delta = await http()
      .get('/api/v1/sync/reference')
      .query({ since: full.body.data.cursor })
      .set(as(org.users.VIEWER))
      .expect(200);
    expect(delta.body.data.rulesets).toMatchObject([{ id, archivedAt: expect.any(String) }]);
  });

  describe('matches', () => {
    const rulesetVersionOf = async (matchId: string) =>
      (
        await app
          .get<Pool>(PG_POOL)
          .query('select ruleset_version_id from matches where id = $1', [matchId])
      ).rows[0]?.ruleset_version_id ?? null;

    async function badmintonRuleset() {
      const res = await http()
        .post(base())
        .set(as(org.users.SCORER))
        .send({
          name: 'Club mercy',
          sport: 'badminton',
          basePresetKey: 'bwf-3x21',
          config: singles21,
          rules: [mercy],
        })
        .expect(201);
      return res.body.data.latest.id as string;
    }

    it('replays the rules on the server and records which version they came from', async () => {
      const versionId = await badmintonRuleset();
      const match = new DeviceMatch(org.workspaceId, [null, null], {
        rules: [mercy],
        rulesetVersionId: versionId,
      });
      const scorer = org.users.SCORER;
      await postEvents(
        app,
        scorer,
        match,
        [...match.opening(), match.rally(0), match.rally(0), match.rally(0)],
        {
          withHeader: true,
        },
      );
      const detail = await http()
        .get(`/api/v1/matches/${match.matchId}`)
        .set(as(scorer))
        .expect(200);
      // The rule's point for the second side is part of the server's state too.
      expect(detail.body.data).toMatchObject({ needsReview: false, result: { summary: '3–1' } });
      expect(await rulesetVersionOf(match.matchId)).toBe(versionId);
    });

    it('does not link a version whose rules differ from the match', async () => {
      const versionId = await badmintonRuleset();
      const match = new DeviceMatch(org.workspaceId, [null, null], {
        rules: [{ ...mercy, priority: 5 }],
        rulesetVersionId: versionId,
      });
      await postEvents(app, org.users.SCORER, match, match.opening(), { withHeader: true });
      expect(await rulesetVersionOf(match.matchId)).toBeNull();
    });

    it('refuses a match whose rules the engine cannot run', async () => {
      const match = new DeviceMatch(org.workspaceId, [null, null], {
        rules: [{ ...mercy, trigger: 'goal' }],
      });
      await postEvents(app, org.users.SCORER, match, match.opening(), {
        withHeader: true,
        expect: 400,
      });
    });
  });
});
