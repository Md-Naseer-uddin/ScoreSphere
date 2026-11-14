import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

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
    expect(() => loadEnv({ JWT_SECRET: base.JWT_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });

  it('requires a long JWT secret', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('parses boolean flags', () => {
    expect(loadEnv(base).RATE_LIMIT_ENABLED).toBe(true);
    expect(loadEnv({ ...base, RATE_LIMIT_ENABLED: 'false' }).RATE_LIMIT_ENABLED).toBe(false);
  });
});

describe('production safety', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@db:5432/scoresphere',
    JWT_SECRET: 'a-production-secret-of-at-least-32-chars',
    CORS_ORIGINS: 'https://app.example.in',
    PUBLIC_APP_URL: 'https://app.example.in',
  };

  it('accepts a complete production configuration', () => {
    expect(() => loadEnv(production)).not.toThrow();
  });

  it('refuses production without CORS origins, rate limits or https links', () => {
    expect(() => loadEnv({ ...production, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...production, RATE_LIMIT_ENABLED: 'false' })).toThrow(
      /RATE_LIMIT_ENABLED/,
    );
    expect(() => loadEnv({ ...production, PUBLIC_APP_URL: 'http://app.example.in' })).toThrow(
      /https/,
    );
  });
});
