// Recreates the e2e database and applies the API's real migrations to it.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const adminUrl =
  process.env.E2E_DATABASE_ADMIN_URL ??
  'postgres://scoresphere:scoresphere@localhost:55432/postgres';
const name = 'scoresphere_e2e';

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`drop database if exists ${name} with (force)`);
await admin.query(`create database ${name}`);
await admin.end();

const url = new URL(adminUrl);
url.pathname = `/${name}`;
const pool = new pg.Pool({ connectionString: url.toString() });
await migrate(drizzle(pool), {
  migrationsFolder: new URL('../apps/api/drizzle', import.meta.url).pathname,
});
await pool.end();
console.log(`e2e database ready: ${name}`);
