import { newId } from '@scoresphere/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/lib/db';
import { mockApi, ok } from '@/test/fetch-mock';
import { signIn, signOut } from '@/test/session';
import { clearReferenceData, syncReference } from './reference-sync';

const ws = (id: string, name: string) => ({ id, type: 'ORGANIZATION', name, role: 'SCORER' });
const team = (id: string, workspaceId: string, archived = false) => ({
  id,
  workspaceId,
  name: id,
  shortName: null,
  sportKeys: [],
  memberCount: 0,
  archived,
  updatedAt: '2026-11-14T00:00:00.000Z',
});
const roster = (id: string, workspaceId: string, archived = false) => ({
  id,
  workspaceId,
  displayName: id,
  jerseyNumber: null,
  link: 'NONE',
  avatarUrl: null,
  claimantName: null,
  archived,
  updatedAt: '2026-11-14T00:00:00.000Z',
});
const member = (
  id: string,
  teamId: string,
  rosterMemberId: string,
  leftAt: string | null = null,
) => ({
  id,
  teamId,
  rosterMemberId,
  jerseyNumber: null,
  leftAt,
  updatedAt: '2026-11-14T00:00:00.000Z',
});

const A = newId();
const B = newId();
// Readable names for generated IDs.
const id = Object.fromEntries(
  ['t1', 't2', 'r1', 'r2', 'r3', 'm1'].map((k) => [k, newId()]),
) as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

describe('syncReference', () => {
  it('stores a full sync, then applies changes and removals from the next one', async () => {
    signIn();
    const database = new LocalDatabase(`sync-${Math.random()}`);
    const { calls } = mockApi({
      'GET /sync/reference': ok({
        cursor: '2026-11-14T10:00:00.000Z',
        workspaces: [ws(A, 'Club A'), ws(B, 'Club B')],
        teams: [team(id.t1!, A), team(id.t2!, B)],
        teamMembers: [member(id.m1!, id.t1!, id.r1!)],
        rosterMembers: [roster(id.r1!, A), roster(id.r2!, B)],
        rulesets: [],
      }),
      'GET /sync/reference?since=2026-11-14T10%3A00%3A00.000Z': ok({
        cursor: '2026-11-14T11:00:00.000Z',
        // Access to Club B was lost; t1 was archived; m1 left; r3 is new.
        workspaces: [ws(A, 'Club A')],
        teams: [team(id.t1!, A, true)],
        teamMembers: [member(id.m1!, id.t1!, id.r1!, '2026-11-14T10:30:00.000Z')],
        rosterMembers: [roster(id.r3!, A)],
        rulesets: [],
      }),
    });

    await syncReference(database);
    expect(await database.teams.count()).toBe(2);
    expect(await database.teamMembers.count()).toBe(1);

    await syncReference(database);
    expect(calls.map((c) => c.path)).toEqual([
      '/sync/reference',
      '/sync/reference?since=2026-11-14T10%3A00%3A00.000Z',
    ]);
    expect((await database.workspaces.toArray()).map((w) => w.name)).toEqual(['Club A']);
    expect(await database.teams.count()).toBe(0);
    expect(await database.teamMembers.count()).toBe(0);
    expect((await database.rosterMembers.toArray()).map((r) => r.id).sort()).toEqual(
      [id.r1!, id.r3!].sort(),
    );
    expect((await database.settings.get('referenceCursor'))?.value).toBe(
      '2026-11-14T11:00:00.000Z',
    );
  });

  it('clears everything on sign-out so the next user starts clean', async () => {
    signIn();
    const database = new LocalDatabase(`sync-${Math.random()}`);
    mockApi({
      'GET /sync/reference': ok({
        cursor: '2026-11-14T10:00:00.000Z',
        workspaces: [ws(A, 'Club A')],
        teams: [team(id.t1!, A)],
        teamMembers: [],
        rosterMembers: [roster(id.r1!, A)],
        rulesets: [],
      }),
    });
    await syncReference(database);
    await clearReferenceData(database);
    expect(await database.teams.count()).toBe(0);
    expect(await database.rosterMembers.count()).toBe(0);
    expect(await database.settings.get('referenceCursor')).toBeUndefined();
  });
});
