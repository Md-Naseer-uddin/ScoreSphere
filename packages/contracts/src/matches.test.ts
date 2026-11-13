import { describe, expect, it } from 'vitest';
import { matchEventSchema, newId, postMatchEventsRequestSchema } from './index.js';

const base = () => ({
  eventId: newId(),
  leaseEpoch: 1,
  engineVersion: 1,
  occurredAt: 1_700_000_000_000,
});

const created = () => ({
  ...base(),
  seq: 1,
  kind: 'CREATED' as const,
  payload: {
    sport: 'badminton',
    presetKey: 'bwf-21',
    presetVersion: 1,
    config: { discipline: 'singles' },
    roster: {
      sides: [
        { side: 0, participantIds: [newId()] },
        { side: 1, participantIds: [newId()] },
      ],
    },
  },
});

describe('match events', () => {
  it('accepts every kind with its payload', () => {
    const events = [
      created(),
      { ...base(), seq: 2, kind: 'LIFECYCLE', payload: { action: 'START' } },
      { ...base(), seq: 3, kind: 'COMMAND', payload: { type: 'rally', winner: 0 } },
      { ...base(), seq: 4, kind: 'VOID', targetSeq: 3, payload: {} },
      { ...base(), seq: 5, kind: 'REPLACE', targetSeq: 3, payload: { type: 'rally', winner: 1 } },
    ];
    for (const e of events) expect(matchEventSchema.safeParse(e).success).toBe(true);
  });

  it('requires a target for corrections', () => {
    const e = { ...base(), seq: 4, kind: 'VOID', payload: {} };
    expect(matchEventSchema.safeParse(e).success).toBe(false);
  });

  it('rejects roster sides out of order', () => {
    const e = created();
    e.payload.roster.sides.reverse();
    expect(matchEventSchema.safeParse(e).success).toBe(false);
  });

  it('rejects unknown lifecycle actions', () => {
    const e = { ...base(), seq: 2, kind: 'LIFECYCLE', payload: { action: 'REWIND' } };
    expect(matchEventSchema.safeParse(e).success).toBe(false);
  });

  it('limits a batch to 200 events', () => {
    const events = Array.from({ length: 201 }, (_, i) => ({
      ...base(),
      seq: i + 2,
      kind: 'COMMAND',
      payload: { type: 'rally', winner: 0 },
    }));
    const parsed = postMatchEventsRequestSchema.safeParse({ deviceId: newId(), events });
    expect(parsed.success).toBe(false);
  });
});
