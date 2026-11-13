import { z } from 'zod';

/** Stable machine-readable error codes. Clients branch on these, never on messages. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const responseMetaSchema = z.object({ requestId: z.string() });

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ field: z.string(), code: z.string() })).optional(),
  }),
  meta: responseMetaSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
