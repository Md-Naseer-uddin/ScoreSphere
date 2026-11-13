import { z } from 'zod';
import { idSchema } from './ids.js';
import { sportKeySchema } from './sports.js';

/**
 * Match ledger and sync protocol (plan §3.4, ADRs 0004–0009).
 *
 * Every change to a match is an event in an append-only ledger. The device holding the
 * scorer lease assigns `seq` (1, 2, 3 …), so corrections can reference events before
 * they reach the server. `seq` 1 is always `CREATED`.
 */

export const MATCH_EVENT_KINDS = ['CREATED', 'COMMAND', 'VOID', 'REPLACE', 'LIFECYCLE'] as const;
export const matchEventKindSchema = z.enum(MATCH_EVENT_KINDS);
export type MatchEventKind = z.infer<typeof matchEventKindSchema>;

export const LIFECYCLE_ACTIONS = ['START', 'PAUSE', 'RESUME', 'ABANDON'] as const;
export const lifecycleActionSchema = z.enum(LIFECYCLE_ACTIONS);
export type LifecycleAction = z.infer<typeof lifecycleActionSchema>;

/** Derived from the ledger; stored on the match only so it can be queried (ADR 0006). */
export const MATCH_STATUSES = ['scheduled', 'live', 'paused', 'completed', 'abandoned'] as const;
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

/** Every launch sport is played between two sides, indexed 0 and 1. */
export const sideIndexSchema = z.union([z.literal(0), z.literal(1)]);
export type SideIndex = z.infer<typeof sideIndexSchema>;

export const deviceIdSchema = z.string().min(8).max(64);

/** Who plays for each side, as opaque match-scoped IDs (ADR 0024: no names in events). */
export const matchRosterSchema = z.object({
  sides: z
    .array(z.object({ side: sideIndexSchema, participantIds: z.array(idSchema).min(1).max(30) }))
    .length(2)
    .refine((sides) => sides[0]?.side === 0 && sides[1]?.side === 1, 'SIDES_ORDER'),
});
export type MatchRoster = z.infer<typeof matchRosterSchema>;

export const createdPayloadSchema = z.object({
  sport: sportKeySchema,
  presetKey: z.string().min(1).max(60),
  presetVersion: z.int().min(1),
  /** Fully resolved settings; the sport's settings schema validates it. */
  config: z.record(z.string(), z.unknown()),
  roster: matchRosterSchema,
});
export type CreatedPayload = z.infer<typeof createdPayloadSchema>;

/** An engine command. The sport's command schema validates the rest of the payload. */
export const commandPayloadSchema = z.looseObject({ type: z.string().min(1).max(60) });
export type CommandPayload = z.infer<typeof commandPayloadSchema>;

export const lifecyclePayloadSchema = z.object({ action: lifecycleActionSchema });
export type LifecyclePayload = z.infer<typeof lifecyclePayloadSchema>;

const eventBase = {
  eventId: idSchema,
  seq: z.int().min(1),
  /** Fencing token of the scorer lease the event was written under (ADR 0007). */
  leaseEpoch: z.int().min(1),
  engineVersion: z.int().min(1),
  /** Device clock, epoch ms. The scoring device owns match time (ADR 0006). */
  occurredAt: z.int().min(0),
};

export const matchEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...eventBase, kind: z.literal('CREATED'), payload: createdPayloadSchema }),
  z.object({ ...eventBase, kind: z.literal('COMMAND'), payload: commandPayloadSchema }),
  z.object({
    ...eventBase,
    kind: z.literal('VOID'),
    targetSeq: z.int().min(1),
    payload: z.object({}),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('REPLACE'),
    targetSeq: z.int().min(1),
    payload: commandPayloadSchema,
  }),
  z.object({ ...eventBase, kind: z.literal('LIFECYCLE'), payload: lifecyclePayloadSchema }),
]);
export type MatchEvent = z.infer<typeof matchEventSchema>;

/** Names shown on scorecards. They live on the match, never in events, so they can be erased. */
export const matchParticipantSnapshotSchema = z.object({
  participantId: idSchema,
  displayName: z.string().trim().min(1, 'REQUIRED').max(60, 'TOO_LONG'),
  /** Null for quick guests and typed-in names (ADR 0011). */
  rosterMemberId: idSchema.nullable(),
});
export type MatchParticipantSnapshot = z.infer<typeof matchParticipantSnapshotSchema>;

export const matchSideSnapshotSchema = z.object({
  side: sideIndexSchema,
  name: z.string().trim().min(1, 'REQUIRED').max(60, 'TOO_LONG'),
  teamId: idSchema.nullable(),
  participants: z.array(matchParticipantSnapshotSchema).min(1).max(30),
});
export type MatchSideSnapshot = z.infer<typeof matchSideSnapshotSchema>;

/** Sent with the first batch of a match created on the device (ADR 0008). */
export const matchHeaderSchema = z.object({
  workspaceId: idSchema,
  title: z.string().trim().max(80, 'TOO_LONG').nullable(),
  sides: z.array(matchSideSnapshotSchema).length(2),
});
export type MatchHeader = z.infer<typeof matchHeaderSchema>;

export const postMatchEventsRequestSchema = z.object({
  deviceId: deviceIdSchema,
  match: matchHeaderSchema.optional(),
  events: z.array(matchEventSchema).min(1).max(200),
});
export type PostMatchEventsRequest = z.infer<typeof postMatchEventsRequestSchema>;

export const EVENT_OUTCOMES = ['ACCEPTED', 'ALREADY_PROCESSED', 'REJECTED', 'CONFLICT'] as const;
export const eventOutcomeSchema = z.enum(EVENT_OUTCOMES);
export type EventOutcome = z.infer<typeof eventOutcomeSchema>;

/**
 * Why an event was not accepted. `CONFLICT` codes mean another device owns the match;
 * `REJECTED` codes mean the event itself is unusable. Both are kept on the server.
 */
export const EVENT_REJECTION_CODES = [
  'STALE_EPOCH',
  'NOT_LEASE_HOLDER',
  'SEQ_TAKEN',
  'SEQ_GAP',
  'ENGINE_VERSION_MISMATCH',
  'BAD_PAYLOAD',
] as const;
export const eventRejectionCodeSchema = z.enum(EVENT_REJECTION_CODES);
export type EventRejectionCode = z.infer<typeof eventRejectionCodeSchema>;

export const eventResultSchema = z.object({
  eventId: idSchema,
  seq: z.int(),
  outcome: eventOutcomeSchema,
  code: eventRejectionCodeSchema.nullable(),
});
export type EventResult = z.infer<typeof eventResultSchema>;

export const postMatchEventsResponseSchema = z.object({
  results: z.array(eventResultSchema),
  /** Highest accepted `seq` on the server. */
  version: z.int(),
  leaseEpoch: z.int(),
  /** Whether the server engine disagreed with an accepted event (ADR 0009). */
  needsReview: z.boolean(),
});
export type PostMatchEventsResponse = z.infer<typeof postMatchEventsResponseSchema>;

export const matchResultSchema = z.object({
  status: z.enum(['in_progress', 'won', 'drawn', 'abandoned', 'no_result']),
  winnerSide: sideIndexSchema.optional(),
  /** Short, sport-specific score line, e.g. "21–15, 18–21, 21–19". */
  summary: z.string(),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

/** A ledger event as the server stores and returns it. */
export const storedMatchEventSchema = z.object({
  eventId: idSchema,
  seq: z.int(),
  kind: matchEventKindSchema,
  payload: z.record(z.string(), z.unknown()),
  targetSeq: z.int().nullable(),
  leaseEpoch: z.int(),
  engineVersion: z.int(),
  occurredAt: z.int(),
});
export type StoredMatchEvent = z.infer<typeof storedMatchEventSchema>;

export const matchSummarySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  sport: sportKeySchema,
  engineVersion: z.int(),
  presetKey: z.string(),
  presetVersion: z.int(),
  title: z.string().nullable(),
  status: matchStatusSchema,
  version: z.int(),
  sides: z.array(
    z.object({ side: sideIndexSchema, name: z.string(), teamId: idSchema.nullable() }),
  ),
  result: matchResultSchema.nullable(),
  needsReview: z.boolean(),
  leaseEpoch: z.int(),
  leaseDeviceId: z.string().nullable(),
  scorerSeenAt: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MatchSummary = z.infer<typeof matchSummarySchema>;

export const matchDetailSchema = matchSummarySchema.extend({
  sides: z.array(matchSideSnapshotSchema),
  events: z.array(storedMatchEventSchema),
});
export type MatchDetail = z.infer<typeof matchDetailSchema>;

export const LEASE_ACTIONS = ['CLAIM', 'TAKEOVER', 'RELEASE', 'HEARTBEAT'] as const;
export const leaseRequestSchema = z.object({
  deviceId: deviceIdSchema,
  /**
   * CLAIM succeeds when the lease is free or already this device's.
   * TAKEOVER moves it from another device (lease holder's own account or a workspace admin).
   * Both bump the epoch when the device changes, which fences off the old device.
   */
  action: z.enum(LEASE_ACTIONS),
});
export type LeaseRequest = z.infer<typeof leaseRequestSchema>;

export const leaseResponseSchema = z.object({
  leaseEpoch: z.int(),
  leaseDeviceId: z.string().nullable(),
  version: z.int(),
});
export type LeaseResponse = z.infer<typeof leaseResponseSchema>;

/** Read-only share links (ADR 0021). The token is only ever returned once, at creation. */
export const SHARE_TOKEN_HEADER = 'x-share-token';

export const createShareLinkRequestSchema = z.object({
  expiresInHours: z
    .int()
    .min(1)
    .max(24 * 30)
    .nullable(),
});
export type CreateShareLinkRequest = z.infer<typeof createShareLinkRequestSchema>;

export const shareLinkSchema = z.object({
  id: idSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const createdShareLinkSchema = shareLinkSchema.extend({ token: z.string() });
export type CreatedShareLink = z.infer<typeof createdShareLinkSchema>;

/** What spectators receive: no workspace, team, roster or user IDs (spec offline §8). */
export const liveEventSchema = storedMatchEventSchema.pick({
  seq: true,
  kind: true,
  payload: true,
  targetSeq: true,
  occurredAt: true,
});
export type LiveEvent = z.infer<typeof liveEventSchema>;

export const liveSnapshotSchema = z.object({
  matchId: idSchema,
  sport: sportKeySchema,
  engineVersion: z.int(),
  title: z.string().nullable(),
  status: matchStatusSchema,
  version: z.int(),
  scorerSeenAt: z.iso.datetime().nullable(),
  sides: z.array(
    z.object({
      side: sideIndexSchema,
      name: z.string(),
      participants: z.array(z.object({ participantId: idSchema, displayName: z.string() })),
    }),
  ),
  events: z.array(liveEventSchema),
});
export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;

/** Incremental update on a live stream; `events` are those after the last sent version. */
export const liveDeltaSchema = z.object({
  version: z.int(),
  status: matchStatusSchema,
  scorerSeenAt: z.iso.datetime().nullable(),
  events: z.array(liveEventSchema),
});
export type LiveDelta = z.infer<typeof liveDeltaSchema>;
