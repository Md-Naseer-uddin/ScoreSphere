import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/** Every entity ID is a UUIDv7 so clients can create records offline (ADR 0022). */
export const idSchema = z.uuid({ version: 'v7' });
export type Id = z.infer<typeof idSchema>;

export function newId(): Id {
  return uuidv7();
}
