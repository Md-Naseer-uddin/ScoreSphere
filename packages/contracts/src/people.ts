import { z } from 'zod';
import { idSchema } from './ids.js';
import { phoneSchema } from './phone.js';

export const lookupRequestSchema = z.object({ phone: phoneSchema });

/**
 * Exact-phone lookup result (ADR 0012). Private accounts and unknown numbers both come
 * back as INVITE, so the lookup never reveals whether a number is registered.
 */
export const lookupResultSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('DISCOVERABLE'),
    person: z.object({ id: idSchema, displayName: z.string(), avatarUrl: z.string().nullable() }),
  }),
  z.object({ result: z.literal('INVITE') }),
  z.object({ result: z.literal('ON_ROSTER'), rosterMemberId: idSchema }),
]);
export type LookupResult = z.infer<typeof lookupResultSchema>;

/** Client-visible link states; the server's two "waiting" states both show as INVITED. */
export const ROSTER_LINK_STATES = ['NONE', 'LINKED', 'INVITED', 'AWAITING_APPROVAL'] as const;
export const rosterLinkStateSchema = z.enum(ROSTER_LINK_STATES);
export type RosterLinkState = z.infer<typeof rosterLinkStateSchema>;

export const rosterMemberSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  displayName: z.string(),
  jerseyNumber: z.string().nullable(),
  link: rosterLinkStateSchema,
  /** The linked account's photo, once linked. */
  avatarUrl: z.string().nullable(),
  /** Name on the account claiming this member; only while awaiting admin approval. */
  claimantName: z.string().nullable(),
  archived: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type RosterMember = z.infer<typeof rosterMemberSchema>;

const memberNameSchema = z.string().trim().min(1, 'REQUIRED').max(100, 'TOO_LONG');
const jerseySchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{0,4}$/, 'INVALID_JERSEY')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/** Link target for a roster member: a discoverable person from lookup, or a phone to invite. */
export const rosterLinkTargetSchema = z
  .object({ personId: idSchema.optional(), phone: phoneSchema.optional() })
  .refine((v) => (v.personId === undefined) !== (v.phone === undefined), {
    message: 'PERSON_OR_PHONE',
  });
export type RosterLinkTarget = z.input<typeof rosterLinkTargetSchema>;

export const createRosterMemberRequestSchema = z.object({
  displayName: memberNameSchema,
  jerseyNumber: jerseySchema,
  link: rosterLinkTargetSchema.optional(),
});
export type CreateRosterMemberRequest = z.input<typeof createRosterMemberRequestSchema>;

export const updateRosterMemberRequestSchema = z.object({
  displayName: memberNameSchema.optional(),
  jerseyNumber: jerseySchema,
});
export type UpdateRosterMemberRequest = z.input<typeof updateRosterMemberRequestSchema>;

/** A workspace that added the signed-in user and is waiting on them, or on its admin. */
export const myRosterLinkSchema = z.object({
  rosterMemberId: idSchema,
  workspaceName: z.string(),
  nameUsed: z.string(),
  state: z.enum(['INVITED', 'AWAITING_APPROVAL']),
  createdAt: z.iso.datetime(),
});
export type MyRosterLink = z.infer<typeof myRosterLinkSchema>;
