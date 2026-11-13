import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from './index.js';

describe('Result', () => {
  it('narrows on ok', () => {
    const r: Result<number, string> = ok(3);
    expect(r.ok && r.value).toBe(3);
  });

  it('narrows on error', () => {
    const r: Result<number, string> = err('nope');
    expect(!r.ok && r.error).toBe('nope');
  });
});
