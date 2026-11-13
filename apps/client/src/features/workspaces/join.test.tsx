import { afterEach, describe, expect, it } from 'vitest';
import { stashInviteToken } from './JoinPage';

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('stashInviteToken', () => {
  it('moves the token from the fragment into session storage and clears the address bar', () => {
    window.history.replaceState(null, '', '/join#tok_123456789012345678');
    expect(stashInviteToken()).toBe('tok_123456789012345678');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/join');
    // Survives the round trip through sign-in, where the fragment is gone.
    expect(stashInviteToken()).toBe('tok_123456789012345678');
  });

  it('returns null without a token', () => {
    window.history.replaceState(null, '', '/join');
    expect(stashInviteToken()).toBeNull();
  });
});
