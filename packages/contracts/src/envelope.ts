import { z } from 'zod';
import { responseMetaSchema } from './errors.js';

/** `{ data, meta }` success envelope used by every endpoint (spec api §1). */
export function dataEnvelope<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

export const cursorMetaSchema = responseMetaSchema.extend({
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export function pageEnvelope<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: cursorMetaSchema });
}
