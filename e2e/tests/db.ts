import pg from 'pg';

/** Direct reads from the e2e database, to check what the server really stored. */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = new URL(
    process.env.E2E_DATABASE_ADMIN_URL ??
      'postgres://scoresphere:scoresphere@localhost:55432/postgres',
  );
  url.pathname = '/scoresphere_e2e';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
