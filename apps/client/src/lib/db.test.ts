import { idSchema } from '@scoresphere/contracts';
import { describe, expect, it } from 'vitest';
import { getDeviceId, LocalDatabase } from './db';

describe('getDeviceId', () => {
  it('creates a UUIDv7 once and returns the same value afterwards', async () => {
    const database = new LocalDatabase(`test-${Math.random()}`);
    const first = await getDeviceId(database);
    expect(idSchema.safeParse(first).success).toBe(true);
    expect(await getDeviceId(database)).toBe(first);
  });

  it('survives reopening the database', async () => {
    const name = `test-${Math.random()}`;
    const first = await getDeviceId(new LocalDatabase(name));
    expect(await getDeviceId(new LocalDatabase(name))).toBe(first);
  });
});
