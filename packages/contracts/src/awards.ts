import { z } from 'zod';
import { idSchema } from './ids.js';
import { sideIndexSchema } from './matches.js';

/**
 * Award records (ADR 0023). Automatic awards are recomputed whenever a completed match
 * changes; organizer choices are never replaced automatically, only marked stale.
 */
export const AWARD_STATUSES = ['PUBLISHED', 'STALE', 'SUPERSEDED'] as const;
export const awardStatusSchema = z.enum(AWARD_STATUSES);

export const AWARD_PROVENANCES = ['AUTO', 'MANUAL', 'OVERRIDE'] as const;
export const awardProvenanceSchema = z.enum(AWARD_PROVENANCES);

export const awardRecordSchema = z.object({
  id: idSchema,
  awardKey: z.string(),
  name: z.string(),
  criteria: z.string(),
  criteriaVersion: z.int(),
  status: awardStatusSchema,
  provenance: awardProvenanceSchema,
  recipients: z.array(
    z.object({ participantId: idSchema, side: sideIndexSchema, displayName: z.string() }),
  ),
  metrics: z.record(z.string(), z.number()),
  /** The organizer's reason for an override; shown to workspace members only. */
  reason: z.string().nullable(),
  publishedAt: z.iso.datetime(),
});
export type AwardRecord = z.infer<typeof awardRecordSchema>;

export const selectAwardRequestSchema = z.object({
  participantIds: z.array(idSchema).min(1).max(4),
  /** Required when replacing an automatic award. */
  reason: z.string().trim().max(200, 'TOO_LONG').nullable(),
});
export type SelectAwardRequest = z.infer<typeof selectAwardRequestSchema>;
