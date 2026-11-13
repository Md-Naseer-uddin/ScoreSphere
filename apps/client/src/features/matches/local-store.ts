import {
  type MatchDetail,
  type MatchEventKind,
  type MatchHeader,
  type MatchSideSnapshot,
  newId,
  type SportKey,
} from '@scoresphere/contracts';
import {
  append,
  err,
  type LedgerError,
  type LedgerEvent,
  type MatchProjection,
  ok,
  replay,
  type Result,
} from '@scoresphere/engine-kit';
import { type AnySportEngine, getEngine, latestEngine } from '@scoresphere/sports';
import Dexie from 'dexie';
import { db, type LocalDatabase, type LocalMatch, type LocalMatchEvent } from '@/lib/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProjection = MatchProjection<any, any, any>;

export function engineFor(sport: SportKey, version: number): AnySportEngine {
  const engine = getEngine(sport, version);
  if (!engine)
    throw new Error(`This app version can't score ${sport} matches from version ${version}.`);
  return engine;
}

export function toLedger(
  e: Pick<LocalMatchEvent, 'seq' | 'kind' | 'payload' | 'targetSeq' | 'occurredAt'>,
): LedgerEvent {
  return {
    seq: e.seq,
    kind: e.kind,
    payload: e.payload,
    targetSeq: e.targetSeq,
    occurredAt: e.occurredAt,
  };
}

/** Replays a ledger for display. Lenient, so events the server flagged still show. */
export function project(
  engine: AnySportEngine,
  events: readonly LedgerEvent[],
): AnyProjection | null {
  const r = replay(engine, events, { lenient: true });
  return r.ok ? r.value : null;
}

export function matchEvents(matchId: string, database: LocalDatabase = db) {
  return database.matchEvents
    .where('[matchId+seq]')
    .between([matchId, Dexie.minKey], [matchId, Dexie.maxKey])
    .toArray();
}

export function matchHeader(match: LocalMatch): MatchHeader {
  return { workspaceId: match.workspaceId, title: match.title, sides: match.sides };
}

function summary(engine: AnySportEngine, p: AnyProjection) {
  const result = p.status === 'abandoned' ? null : engine.result(p.state);
  return {
    status: p.status,
    resultSummary: result?.summary ?? '',
    winnerSide: result?.winnerSide ?? null,
    version: p.version,
    updatedAt: new Date().toISOString(),
  };
}

export interface NewLocalMatch {
  ownerUserId: string;
  workspaceId: string;
  sport: SportKey;
  presetKey: string;
  presetVersion: number;
  config: Record<string, unknown>;
  title: string | null;
  sides: MatchSideSnapshot[];
}

/**
 * Creates a match on this device, possibly offline (ADR 0008): `CREATED` is event 1, the
 * match starts with event 2, and this device holds lease epoch 1. The server learns of it
 * on the first sync.
 */
export async function createLocalMatch(
  input: NewLocalMatch,
  database: LocalDatabase = db,
): Promise<Result<string, LedgerError>> {
  const engine = latestEngine(input.sport);
  if (!engine) throw new Error(`${input.sport} can't be scored yet`);
  const matchId = newId();
  const now = Date.now();
  const base = {
    matchId,
    leaseEpoch: 1,
    engineVersion: engine.version,
    sync: 'pending' as const,
    code: null,
    targetSeq: null,
  };
  const events: LocalMatchEvent[] = [
    {
      ...base,
      seq: 1,
      eventId: newId(),
      kind: 'CREATED',
      occurredAt: now,
      payload: {
        sport: input.sport,
        presetKey: input.presetKey,
        presetVersion: input.presetVersion,
        config: input.config,
        roster: {
          sides: input.sides.map((s) => ({
            side: s.side,
            participantIds: s.participants.map((p) => p.participantId),
          })),
        },
      },
    },
    {
      ...base,
      seq: 2,
      eventId: newId(),
      kind: 'LIFECYCLE',
      occurredAt: now,
      payload: { action: 'START' },
    },
  ];
  const checked = replay(engine, events.map(toLedger));
  if (!checked.ok) return err(checked.error);

  const iso = new Date(now).toISOString();
  await database.transaction('rw', database.matches, database.matchEvents, async () => {
    await database.matches.add({
      id: matchId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      sport: input.sport,
      engineVersion: engine.version,
      presetKey: input.presetKey,
      presetVersion: input.presetVersion,
      title: input.title,
      sides: input.sides,
      leaseEpoch: 1,
      holdsLease: true,
      serverKnown: false,
      needsReview: false,
      syncError: null,
      createdAt: iso,
      ...summary(engine, checked.value),
    });
    await database.matchEvents.bulkAdd(events);
  });
  return ok(matchId);
}

/**
 * The projection after the last event recorded on this device, so a tap extends it instead
 * of replaying the whole ledger (a long cricket innings is hundreds of events).
 */
const projectionCache = new Map<string, { version: number; projection: AnyProjection }>();

export function forgetProjection(matchId: string): void {
  projectionCache.delete(matchId);
}

export type RecordError = LedgerError | { code: 'NOT_SCORER'; message: string; seq: number };

export interface NewEvent {
  kind: Exclude<MatchEventKind, 'CREATED'>;
  payload: Record<string, unknown>;
  targetSeq?: number;
}

/**
 * The scorer's write path (plan §3.4): validate against the ledger, then append the event
 * and update the match in one transaction. Nothing is shown as saved until this resolves.
 */
export async function recordEvent(
  matchId: string,
  input: NewEvent,
  database: LocalDatabase = db,
): Promise<Result<AnyProjection, RecordError>> {
  const result = await database.transaction(
    'rw',
    database.matches,
    database.matchEvents,
    async (): Promise<Result<AnyProjection, RecordError>> => {
      const match = await database.matches.get(matchId);
      if (!match) throw new Error('Match not found on this device');
      if (!match.holdsLease) {
        return err({
          code: 'NOT_SCORER',
          message: 'Another device is scoring this match.',
          seq: match.version + 1,
        });
      }
      const engine = engineFor(match.sport, match.engineVersion);
      const ledger = (await matchEvents(matchId, database)).filter((e) => e.seq > 0).map(toLedger);
      const cached = projectionCache.get(matchId);
      const current =
        cached && cached.version === match.version ? cached.projection : project(engine, ledger);
      if (!current) throw new Error('The match on this device is damaged');

      const event: LocalMatchEvent = {
        matchId,
        seq: match.version + 1,
        eventId: newId(),
        kind: input.kind,
        payload: input.payload,
        targetSeq: input.targetSeq ?? null,
        leaseEpoch: match.leaseEpoch,
        engineVersion: match.engineVersion,
        occurredAt: Date.now(),
        sync: 'pending',
        code: null,
      };
      const next = append(engine, current, ledger, toLedger(event));
      if (!next.ok) return next;
      await database.matchEvents.add(event);
      await database.matches.update(matchId, summary(engine, next.value));
      return next;
    },
  );
  // Only after the transaction committed: the cache must never get ahead of the database.
  if (result.ok)
    projectionCache.set(matchId, { version: result.value.version, projection: result.value });
  return result;
}

/**
 * Makes this device the scorer of a match from the server (after a lease claim or
 * takeover): its ledger is stored as already synced, and new events follow on.
 */
export async function adoptServerMatch(
  detail: MatchDetail,
  ownerUserId: string,
  leaseEpoch: number,
  database: LocalDatabase = db,
): Promise<void> {
  const engine = engineFor(detail.sport, detail.engineVersion);
  const events: LocalMatchEvent[] = detail.events.map((e) => ({
    matchId: detail.id,
    seq: e.seq,
    eventId: e.eventId,
    kind: e.kind,
    payload: e.payload,
    targetSeq: e.targetSeq,
    leaseEpoch: e.leaseEpoch,
    engineVersion: e.engineVersion,
    occurredAt: e.occurredAt,
    sync: 'synced',
    code: null,
  }));
  const p = project(engine, events.map(toLedger));
  if (!p) throw new Error('The match from the server could not be read');
  forgetProjection(detail.id);
  await database.transaction('rw', database.matches, database.matchEvents, async () => {
    const existing = await matchEvents(detail.id, database);
    // Events this device had but the server never accepted stay, renumbered out of the way.
    const kept = existing.filter((e) => e.sync !== 'synced');
    await database.matchEvents
      .where('[matchId+seq]')
      .between([detail.id, Dexie.minKey], [detail.id, Dexie.maxKey])
      .delete();
    await database.matchEvents.bulkAdd(events);
    await database.matchEvents.bulkAdd(
      kept.map((e, i) => ({
        ...e,
        seq: -(i + 1),
        sync: e.sync === 'pending' ? 'conflict' : e.sync,
      })),
    );
    await database.matches.put({
      id: detail.id,
      ownerUserId,
      workspaceId: detail.workspaceId,
      sport: detail.sport,
      engineVersion: detail.engineVersion,
      presetKey: detail.presetKey,
      presetVersion: detail.presetVersion,
      title: detail.title,
      sides: detail.sides,
      leaseEpoch,
      holdsLease: true,
      serverKnown: true,
      needsReview: detail.needsReview,
      syncError: null,
      createdAt: detail.createdAt,
      ...summary(engine, p),
    });
  });
}
