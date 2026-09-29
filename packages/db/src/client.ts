import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/** Dossier des migrations SQL versionnées (même profondeur depuis src/ et dist/). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function connect(url: string | undefined = process.env.DATABASE_URL, max = 10): DbHandle {
  if (!url) throw new Error('DATABASE_URL absent (lancer : bash infra/dev-env.sh)');
  const pool = new pg.Pool({ connectionString: url, max, application_name: 'awform' });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/** Base de TEST uniquement : efface tout (schémas public et drizzle) avant de rejouer les migrations. */
export async function resetTestDatabase(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ db: string }>('select current_database() as db');
  const name = rows[0]?.db ?? '';
  if (!name.endsWith('_test')) throw new Error(`refus : ${name} n'est pas une base de test`);
  await pool.query(
    'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
  );
  // file pg-boss : son schéma appartient au compte « worker » de test (lot 14) → effacé en devenant ce compte
  const client = await pool.connect();
  try {
    const { rows: o } = await client.query<{ owner: string }>(
      "select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'pgboss'",
    );
    if (o[0]) {
      await client.query(`SET ROLE "${o[0].owner.replace(/"/g, '""')}"`);
      await client.query('DROP SCHEMA pgboss CASCADE');
      await client.query('RESET ROLE');
    }
  } finally {
    client.release();
  }
}
