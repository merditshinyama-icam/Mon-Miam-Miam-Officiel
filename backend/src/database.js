import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function openDatabase({
  url = process.env.DATABASE_URL,
  directory = path.resolve(process.env.DATA_DIR || 'data', 'postgres'),
  memory = false,
} = {}) {
  let client;
  if (url && !memory) {
    client = new pg.Pool({
      connectionString: url,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  } else {
    if (!memory) await mkdir(directory, { recursive: true });
    client = new PGlite(memory ? undefined : directory);
  }
  const embedded = client instanceof PGlite;
  const sqlDirectory = new URL('../sql/', import.meta.url);
  const migrations = (await readdir(sqlDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, sqlDirectory), 'utf8');
    if (embedded) await client.exec(sql);
    else await client.query(sql);
  }
  const query = (sql, args = []) => client.query(sql, args);
  // The embedded engine has one connection. Its transaction API queues queries safely.
  // A single advisory lock serializes business writes in this first restaurant deployment.
  async function transaction(work) {
    if (embedded) return client.transaction((tx) => work(tx));
    const connection = await client.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SELECT pg_advisory_xact_lock(914014)');
      const result = await work(connection);
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }
  return {
    query,
    transaction,
    close: () => (embedded ? client.close() : client.end()),
    engine: embedded ? 'pglite' : 'postgresql',
  };
}
