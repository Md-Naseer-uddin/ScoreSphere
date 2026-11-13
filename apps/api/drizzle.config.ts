import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgres://scoresphere:scoresphere@localhost:55432/scoresphere',
  },
  strict: true,
  verbose: true,
});
