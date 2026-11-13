import { recoveryCodeSchema } from '@scoresphere/contracts';
import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, normalizeRecoveryCode, randomToken, sha256Hex } from './crypto';

describe('crypto helpers', () => {
  it('generates recovery codes the contract accepts', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
      expect(recoveryCodeSchema.parse(code)).toBe(normalizeRecoveryCode(code));
    }
  });

  it('generates distinct tokens', () => {
    expect(new Set(Array.from({ length: 20 }, () => randomToken())).size).toBe(20);
  });

  it('hashes deterministically', () => {
    expect(sha256Hex('a')).toBe(sha256Hex('a'));
    expect(sha256Hex('a')).toHaveLength(64);
  });
});
