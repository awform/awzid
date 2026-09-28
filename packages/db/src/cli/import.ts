#!/usr/bin/env node
/**
 * Import d'une édition : node dist/cli/import.js [--edition dev] [--levels en1,ad1] [--publish] [--replace] [--test]
 * Lit ~/awform-content (AWFORM_CONTENT_DIR), contrôle, puis écrit en base dans une transaction.
 */
import { loadEdition } from '@awform/content';
import { connect, runMigrations } from '../client.js';
import { contentDir, loadRootEnv } from '../env.js';
import { importEdition } from '../import.js';

loadRootEnv();
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const code = opt('--edition', process.env.AWFORM_EDITION ?? 'dev');
const levels = opt('--levels', 'en1,ad1').split(',').filter(Boolean);
const url = args.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

const load = loadEdition({ contentDir: contentDir(), levels });
const h = connect(url, 2);
try {
  await runMigrations(h.db);
  const r = await importEdition(h.db, load, {
    code,
    publish: args.includes('--publish'),
    replace: args.includes('--replace'),
  });
  const v = load.verseStats;
  console.log(
    `Édition ${code} : ${r.status} (${r.units} unités, ${r.exercises} exercices) ; versets ${v.total} contrôlés, ${v.erreurs} erreur ; avertissements ${load.issues.length}`,
  );
} finally {
  await h.close();
}
