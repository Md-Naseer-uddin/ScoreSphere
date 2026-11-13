import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, idSchema, newId, SPORT_KEYS } from './index.js';

describe('ids', () => {
  it('generates UUIDv7 values that validate', () => {
    const id = newId();
    expect(idSchema.safeParse(id).success).toBe(true);
  });

  it('rejects non-v7 UUIDs', () => {
    expect(idSchema.safeParse('9b2f1c4e-8d3a-4f5b-9c6d-7e8f9a0b1c2d').success).toBe(false);
  });

  it('orders by creation time', () => {
    const a = newId();
    const b = newId();
    expect(a < b).toBe(true);
  });
});

describe('error envelope', () => {
  it('accepts the documented shape', () => {
    const parsed = errorEnvelopeSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        details: [{ field: 'phone', code: 'INVALID_PHONE' }],
      },
      meta: { requestId: 'req-1' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('sport keys', () => {
  it('lists the 12 launch sports', () => {
    expect(SPORT_KEYS).toHaveLength(12);
    expect(new Set(SPORT_KEYS).size).toBe(12);
  });
});
