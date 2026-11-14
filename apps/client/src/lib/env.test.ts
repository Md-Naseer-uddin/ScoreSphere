import { describe, expect, it } from 'vitest';
import { parseClientEnv } from './env';

describe('client environment', () => {
  it('treats empty values as unset', () => {
    expect(parseClientEnv({ VITE_API_URL: '', VITE_PUBLIC_APP_URL: '' })).toEqual({
      apiUrl: '/api/v1',
      publicAppUrl: globalThis.location.origin,
    });
  });

  it('uses absolute addresses for the Android app, without trailing slashes', () => {
    expect(
      parseClientEnv({
        VITE_API_URL: 'https://scores.example/api/v1/',
        VITE_PUBLIC_APP_URL: 'https://scores.example/',
      }),
    ).toEqual({ apiUrl: 'https://scores.example/api/v1', publicAppUrl: 'https://scores.example' });
  });
});
