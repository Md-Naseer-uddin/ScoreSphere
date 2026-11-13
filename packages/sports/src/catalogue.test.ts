import { SPORT_KEYS } from '@scoresphere/contracts';
import { describe, expect, it } from 'vitest';
import { getSport, SPORTS } from './index.js';

describe('sports catalogue', () => {
  it('defines every sport key exactly once', () => {
    expect(SPORTS.map((s) => s.key).sort()).toEqual([...SPORT_KEYS].sort());
  });

  it('displays field hockey as Hockey', () => {
    expect(getSport('field-hockey').name).toBe('Hockey');
  });
});
