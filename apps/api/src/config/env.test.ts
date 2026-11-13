import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3300);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('splits CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast on a missing or invalid database URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});
