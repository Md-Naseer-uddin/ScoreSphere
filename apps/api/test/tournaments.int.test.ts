import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@scoresphere/contracts';
import { bearer, createTestApp, resetDatabase, type TestUser } from './support/app';
import { DeviceMatch, postEvents } from './support/matches';
import { type OrgFixture, orgWithEveryRole } from './support/workspaces';

/** One game to 3, so each fixture is a few rallies. */
const quick = {
  discipline: 'singles',
  pointsToWin: 3,
  winBy: 1,
  cap: 3,
  gamesToWin: 1,
  intervalAt: null,
  deciderChangeEndsAt: null,
};

interface Fixture {
  id: string;
  round: number;
  position: number;
  side1EntryId: string | null;
  side2EntryId: string | null;
  bye: boolean;
  status: string;
  winnerEntryId: string | null;
}
interface Entry {
  id: string;
  rosterMemberId: string;
  displayName: string;
}

describe('tournaments', () => {
  let app: INestApplication;
  let org: OrgFixture;
  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => bearer(user.accessToken);
  const scorer = () => org.users.SCORER;

  async function rosterMember(name: string) {
    const res = await http()
      .post(`/api/v1/workspaces/${org.workspaceId}/roster-members`)
      .set(as(scorer()))
      .send({ displayName: name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function tournament(format: 'round_robin' | 'single_elimination', names: string[]) {
    const created = await http()
      .post(`/api/v1/workspaces/${org.workspaceId}/tournaments`)
      .set(as(scorer()))
      .send({
        name: 'Club Open',
        sport: 'badminton',
        format,
        presetKey: 'quick',
        presetVersion: 1,
        config: quick,
      })
      .expect(201);
    const id = created.body.data.id as string;
    const members = [];
    for (const name of names) members.push(await rosterMember(name));
    await http()
      .post(`/api/v1/tournaments/${id}/entries`)
      .set(as(scorer()))
      .send({ entries: members.map((rosterMemberId) => ({ rosterMemberId })) })
      .expect(200);
    const res = await http()
      .post(`/api/v1/tournaments/${id}/fixtures`)
      .set(as(scorer()))
      .expect(200);
    return {
      id,
      entries: res.body.data.entries as Entry[],
      fixtures: res.body.data.fixtures as Fixture[],
    };
  }

  const detail = async (id: string) =>
    (await http().get(`/api/v1/tournaments/${id}`).set(as(org.users.VIEWER)).expect(200)).body
      .data as {
      status: string;
      fixtures: Fixture[];
    };

  /** Scores a fixture to a win for `winner` (0 = the fixture's first entry). */
  async function play(entries: Entry[], fixture: Fixture, winner: 0 | 1) {
    const member = (entryId: string | null) =>
      entries.find((e) => e.id === entryId)!.rosterMemberId;
    const match = new DeviceMatch(
      org.workspaceId,
      [member(fixture.side1EntryId), member(fixture.side2EntryId)],
      {
        config: quick,
        presetKey: 'quick',
        fixtureId: fixture.id,
      },
    );
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

  it('runs a round robin: fixtures, standings, completion, awards, a correction and republishing', async () => {
    const t = await tournament('round_robin', ['Asha', 'Ravi', 'Kiran']);
    expect(t.fixtures).toHaveLength(3);
    const name = (entryId: string | null) => t.entries.find((e) => e.id === entryId)!.displayName;
    const asha = t.entries.find((e) => e.displayName === 'Asha')!.id;

    // Asha wins both her fixtures; Ravi beats Kiran.
    const matches = [];
    for (const f of t.fixtures) {
      const ashaSide = f.side1EntryId === asha ? 0 : f.side2EntryId === asha ? 1 : null;
      const winner = ashaSide ?? (name(f.side1EntryId) === 'Ravi' ? 0 : 1);
      matches.push({ fixture: f, match: await play(t.entries, f, winner) });
    }
    const standings = (
      await http()
        .get(`/api/v1/tournaments/${t.id}/standings`)
        .set(as(org.users.VIEWER))
        .expect(200)
    ).body.data;
    expect(
      standings.map((r: { displayName: string; points: number }) => [r.displayName, r.points]),
    ).toEqual([
      ['Asha', 2],
      ['Ravi', 1],
      ['Kiran', 0],
    ]);
    expect((await detail(t.id)).status).toBe('completed');

    const awards = async () =>
      (await http().get(`/api/v1/tournaments/${t.id}/awards`).set(as(org.users.VIEWER)).expect(200))
        .body.data as {
        awardKey: string;
        status: string;
        recipients: { displayName: string }[];
      }[];
    expect(
      (await awards()).map((a) => [a.awardKey, a.status, a.recipients[0]!.displayName]),
    ).toEqual([
      ['champion', 'PUBLISHED', 'Asha'],
      ['runner-up', 'PUBLISHED', 'Ravi'],
    ]);

    // A correction to Ravi v Kiran after publishing: the awards go back for review.
    const rk = matches.find(
      (m) => m.fixture.side1EntryId !== asha && m.fixture.side2EntryId !== asha,
    )!;
    await postEvents(app, scorer(), rk.match, [rk.match.undo(rk.match.seq)]);
    expect((await awards()).every((a) => a.status === 'STALE')).toBe(true);
    // The corrected game: from 2–0 to Ravi, Kiran takes three points and the match.
    const kiran = (name(rk.fixture.side1EntryId) === 'Kiran' ? 0 : 1) as 0 | 1;
    await postEvents(app, scorer(), rk.match, [
      rk.match.rally(kiran),
      rk.match.rally(kiran),
      rk.match.rally(kiran),
    ]);

    await http().post(`/api/v1/tournaments/${t.id}/awards/publish`).set(as(scorer())).expect(403);
    const republished = await http()
      .post(`/api/v1/tournaments/${t.id}/awards/publish`)
      .set(as(org.users.ADMIN))
      .expect(200);
    expect(
      republished.body.data.map(
        (a: { awardKey: string; status: string; recipients: { displayName: string }[] }) => [
          a.awardKey,
          a.status,
          a.recipients[0]!.displayName,
        ],
      ),
    ).toEqual([
      ['champion', 'PUBLISHED', 'Asha'],
      ['runner-up', 'PUBLISHED', 'Kiran'],
    ]);
  });

  it('runs a knockout with a bye, advancing winners to the final', async () => {
    const t = await tournament('single_elimination', ['Asha', 'Ravi', 'Kiran']);
    const first = t.fixtures.filter((f) => f.round === 1);
    expect(first.find((f) => f.bye)?.winnerEntryId).toBe(t.entries[0]!.id);
    const semi = first.find((f) => !f.bye)!;
    let final = t.fixtures.find((f) => f.round === 2)!;
    expect(final.status).toBe('waiting');

    await play(t.entries, semi, 1); // Kiran (seed 3) beats Ravi (seed 2)
    final = (await detail(t.id)).fixtures.find((f) => f.round === 2)!;
    expect([final.side1EntryId, final.side2EntryId]).toEqual([t.entries[0]!.id, t.entries[2]!.id]);
    expect(final.status).toBe('ready');

    await play(t.entries, final, 0);
    const done = await detail(t.id);
    expect(done.status).toBe('completed');
    const awards = (
      await http().get(`/api/v1/tournaments/${t.id}/awards`).set(as(org.users.VIEWER)).expect(200)
    ).body.data;
    expect(
      awards.map((a: { awardKey: string; recipients: { displayName: string }[] }) => [
        a.awardKey,
        a.recipients[0]!.displayName,
      ]),
    ).toEqual([
      ['champion', 'Asha'],
      ['runner-up', 'Kiran'],
    ]);
  });

  it('only links a fixture to a match with its entries and settings', async () => {
    const t = await tournament('round_robin', ['Asha', 'Ravi']);
    const f = t.fixtures[0]!;
    const member = (entryId: string | null) =>
      t.entries.find((e) => e.id === entryId)!.rosterMemberId;
    const post = (match: DeviceMatch, status: number) =>
      http()
        .post(`/api/v1/matches/${match.matchId}/events`)
        .set(as(scorer()))
        .send({ deviceId: match.deviceId, match: match.header, events: match.opening() })
        .expect(status);

    const swapped = new DeviceMatch(
      org.workspaceId,
      [member(f.side2EntryId), member(f.side1EntryId)],
      { config: quick, presetKey: 'quick', fixtureId: f.id },
    );
    expect((await post(swapped, 400)).body.error.details[0].code).toBe('SIDES_MISMATCH');
    const otherRules = new DeviceMatch(
      org.workspaceId,
      [member(f.side1EntryId), member(f.side2EntryId)],
      { fixtureId: f.id },
    );
    expect((await post(otherRules, 400)).body.error.details[0].code).toBe('SETTINGS_MISMATCH');
    await play(t.entries, f, 0);
    const again = new DeviceMatch(
      org.workspaceId,
      [member(f.side1EntryId), member(f.side2EntryId)],
      { config: quick, presetKey: 'quick', fixtureId: f.id },
    );
    expect((await post(again, 409)).body.error.details[0].code).toBe('FIXTURE_TAKEN');
  });

  it('builds cricket leaderboards and player awards from team entries', async () => {
    const cricket = {
      playersPerSide: 2,
      oversPerInnings: 1,
      ballsPerOver: 6,
      maxOversPerBowler: null,
      allowConsecutiveOvers: false,
      wideRuns: 1,
      noBallRuns: 1,
      freeHit: true,
      lastManStands: false,
      sixAndOut: 'off',
      oneTipOneHand: false,
      consecutiveWides: null,
      superOver: 'off',
    };
    const team = async (name: string, players: string[]) => {
      const members = [];
      for (const p of players) members.push(await rosterMember(p));
      const res = await http()
        .post(`/api/v1/workspaces/${org.workspaceId}/teams`)
        .set(as(scorer()))
        .send({ name, sportKeys: ['cricket'] })
        .expect(201);
      await http()
        .post(`/api/v1/workspaces/${org.workspaceId}/teams/${res.body.data.id}/members`)
        .set(as(scorer()))
        .send({ rosterMemberIds: members })
        .expect(200);
      return { id: res.body.data.id as string, members };
    };
    const lions = await team('Lions', ['Asha', 'Bina']);
    const tigers = await team('Tigers', ['Ravi', 'Dev']);
    const created = await http()
      .post(`/api/v1/workspaces/${org.workspaceId}/tournaments`)
      .set(as(scorer()))
      .send({
        name: 'Mini League',
        sport: 'cricket',
        format: 'round_robin',
        presetKey: 'quick',
        presetVersion: 1,
        config: cricket,
      })
      .expect(201);
    const id = created.body.data.id as string;
    await http()
      .post(`/api/v1/tournaments/${id}/entries`)
      .set(as(scorer()))
      .send({ entries: [{ teamId: lions.id }, { teamId: tigers.id }] })
      .expect(200);
    const fixture = (
      await http().post(`/api/v1/tournaments/${id}/fixtures`).set(as(scorer())).expect(200)
    ).body.data.fixtures[0];
    const entries = (await http().get(`/api/v1/tournaments/${id}`).set(as(scorer())).expect(200))
      .body.data.entries;
    const sideTeams = [fixture.side1EntryId, fixture.side2EntryId].map((entryId: string) =>
      entries.find((e: { id: string; teamId: string }) => e.id === entryId).teamId === lions.id
        ? lions
        : tigers,
    );

    // Participants are this match's own IDs; the roster member links them to the players.
    const ids = sideTeams.map((t) => t.members.map(() => newId()));
    const match = new DeviceMatch(org.workspaceId, [null, null], {
      config: cricket,
      presetKey: 'quick',
      fixtureId: fixture.id,
    });
    const header = {
      ...match.header,
      sides: sideTeams.map((t, side) => ({
        side: side as 0 | 1,
        name: t === lions ? 'Lions' : 'Tigers',
        teamId: t.id,
        participants: t.members.map((rosterMemberId, i) => ({
          participantId: ids[side]![i]!,
          displayName: `P${side}${i}`,
          rosterMemberId,
        })),
      })),
    };
    const ev = (kind: string, payload: unknown) =>
      match.event({ kind: kind as 'COMMAND', payload });
    const deliveries = (runs: number, boundary: boolean) =>
      Array.from({ length: 6 }, () =>
        ev('COMMAND', { type: 'delivery', kind: 'bat', runs, boundary }),
      );
    const events = [
      ev('CREATED', {
        sport: 'cricket',
        presetKey: 'quick',
        presetVersion: 1,
        config: cricket,
        roster: { sides: [0, 1].map((side) => ({ side, participantIds: ids[side] })) },
      }),
      ev('LIFECYCLE', { action: 'START' }),
      ev('COMMAND', {
        type: 'start_innings',
        battingSide: 0,
        strikerId: ids[0]![0],
        nonStrikerId: ids[0]![1],
      }),
      ev('COMMAND', { type: 'set_bowler', bowlerId: ids[1]![0] }),
      ...deliveries(4, true),
      ev('COMMAND', { type: 'start_innings', strikerId: ids[1]![0], nonStrikerId: ids[1]![1] }),
      ev('COMMAND', { type: 'set_bowler', bowlerId: ids[0]![0] }),
      ...deliveries(1, false),
    ];
    const res = await http()
      .post(`/api/v1/matches/${match.matchId}/events`)
      .set(as(scorer()))
      .send({ deviceId: match.deviceId, match: header, events })
      .expect(200);
    expect(res.body.data.results.every((r: { outcome: string }) => r.outcome === 'ACCEPTED')).toBe(
      true,
    );

    const opener = sideTeams[0]!.members[0]!;
    const boards = (
      await http()
        .get(`/api/v1/tournaments/${id}/leaderboards`)
        .set(as(org.users.VIEWER))
        .expect(200)
    ).body.data;
    expect(boards[0]).toMatchObject({
      metric: 'runs',
      rows: [{ rosterMemberId: opener, value: 24 }, { value: 3 }, { value: 3 }],
    });
    const awards = (
      await http().get(`/api/v1/tournaments/${id}/awards`).set(as(org.users.VIEWER)).expect(200)
    ).body.data;
    expect(awards.map((a: { awardKey: string }) => a.awardKey)).toEqual([
      'champion',
      'runner-up',
      'player-of-the-tournament',
      'best-batter',
    ]);
    expect(
      awards.find((a: { awardKey: string }) => a.awardKey === 'best-batter').recipients,
    ).toEqual([
      { kind: 'roster_member', id: opener, displayName: sideTeams[0] === lions ? 'Asha' : 'Ravi' },
    ]);
  });

  it('keeps tournaments to the workspace and its roles', async () => {
    const t = await tournament('round_robin', ['Asha', 'Ravi']);
    await http().get(`/api/v1/tournaments/${t.id}`).set(as(org.users.OUTSIDER)).expect(404);
    await http()
      .get(`/api/v1/tournaments/${t.id}/standings`)
      .set(as(org.users.OUTSIDER))
      .expect(404);
    await http()
      .post(`/api/v1/workspaces/${org.workspaceId}/tournaments`)
      .set(as(org.users.VIEWER))
      .send({
        name: 'X',
        sport: 'badminton',
        format: 'round_robin',
        presetKey: 'quick',
        presetVersion: 1,
        config: quick,
      })
      .expect(403);
    await http().post(`/api/v1/tournaments/${t.id}/fixtures`).set(as(scorer())).expect(409);
  });
});
