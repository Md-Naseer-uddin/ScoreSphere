import type {
  LiveEvent,
  MatchResult,
  MatchStatus,
  MatchSummary,
  SideIndex,
  SportKey,
  StoredMatchEvent,
} from '@scoresphere/contracts';
import type { LedgerEvent } from '@scoresphere/engine-kit';
import type { matchEvents, matches, matchSides } from '../database/schema';

export type MatchRow = typeof matches.$inferSelect;
export type MatchEventRow = typeof matchEvents.$inferSelect;
export type MatchSideRow = typeof matchSides.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toSummary(row: MatchRow, sides: MatchSideRow[]): MatchSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sport: row.sport as SportKey,
    engineVersion: row.engineVersion,
    presetKey: row.presetKey,
    presetVersion: row.presetVersion,
    title: row.title,
    status: row.status as MatchStatus,
    version: row.version,
    sides: sides
      .filter((s) => s.matchId === row.id)
      .sort((a, b) => a.side - b.side)
      .map((s) => ({ side: s.side as SideIndex, name: s.name, teamId: s.teamId })),
    result: (row.result as MatchResult | null) ?? null,
    needsReview: row.needsReview,
    leaseEpoch: row.leaseEpoch,
    leaseDeviceId: row.leaseDeviceId,
    scorerSeenAt: iso(row.scorerSeenAt),
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStoredEvent(row: MatchEventRow): StoredMatchEvent {
  return {
    eventId: row.eventId,
    seq: row.seq,
    kind: row.kind as StoredMatchEvent['kind'],
    payload: row.payload as Record<string, unknown>,
    targetSeq: row.targetSeq,
    leaseEpoch: row.leaseEpoch,
    engineVersion: row.engineVersion,
    occurredAt: row.occurredAt.getTime(),
  };
}

export function toLiveEvent(row: MatchEventRow): LiveEvent {
  const { seq, kind, payload, targetSeq, occurredAt } = toStoredEvent(row);
  return { seq, kind, payload, targetSeq, occurredAt };
}

export function toLedgerEvent(row: MatchEventRow): LedgerEvent {
  return {
    seq: row.seq,
    kind: row.kind as LedgerEvent['kind'],
    payload: row.payload,
    targetSeq: row.targetSeq,
    occurredAt: row.occurredAt.getTime(),
  };
}
