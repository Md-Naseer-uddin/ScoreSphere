import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Starts one Postgres for the integration run and applies the real migrations to it. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const url = container.getConnectionUri();
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  await pool.end();
  project.provide('databaseUrl', url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
