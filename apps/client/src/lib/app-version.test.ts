import { describe, expect, it } from 'vitest';
import { isBelowMinimum, isUpdateAvailable } from './app-version';

const info = {
  minClientVersion: '0.4.0',
  latestVersion: '0.5.2',
  apk: null,
  releaseNotesUrl: null,
};

describe('app version checks', () => {
  it('blocks new matches only below the minimum version', () => {
    expect(isBelowMinimum(info, '0.3.9')).toBe(true);
    expect(isBelowMinimum(info, '0.4.0')).toBe(false);
    expect(isBelowMinimum(null, '0.0.1')).toBe(false);
  });

  it('offers an update when a newer release exists', () => {
    expect(isUpdateAvailable(info, '0.5.1')).toBe(true);
    expect(isUpdateAvailable(info, '0.10.0')).toBe(false);
  });
});
