import { describe, expect, it } from 'vitest';
import { scrub } from './error-reporter';

describe('error report scrubbing', () => {
  it('removes phone numbers, emails and tokens', () => {
    const text =
      'duplicate key (phone)=(+919876543210) for asha@example.com with token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnopqrstuvwxyz0123';
    const clean = scrub(text);
    expect(clean).not.toMatch(/9876543210|asha@|eyJhbGci/);
    expect(clean).toContain('[number]');
    expect(clean).toContain('[email]');
    expect(clean).toContain('[token]');
  });

  it('leaves ordinary messages readable', () => {
    expect(scrub('Cannot read properties of undefined (reading "seq")')).toBe(
      'Cannot read properties of undefined (reading "seq")',
    );
  });
});
