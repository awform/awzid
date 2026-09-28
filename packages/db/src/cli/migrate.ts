#!/usr/bin/env node
/** Applique les migrations SQL versionnées : node dist/cli/migrate.js [--test] */
import { connect, runMigrations } from '../client.js';
import { loadRootEnv } from '../env.js';

loadRootEnv();
const url = process.argv.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
const h = connect(url, 2);
try {
  await runMigrations(h.db);
  console.log('Migrations appliquées.');
} finally {
  await h.close();
}
