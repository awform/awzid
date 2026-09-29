#!/usr/bin/env node
/**
 * Import d'une édition :
 *   node dist/cli/import.js [--edition dev] [--levels en1,ad1] [--publish] [--replace] [--test] [--demo] [--rapport f.md]
 * Lit ~/awform-content (AWFORM_CONTENT_DIR), contrôle, puis écrit en base dans une transaction.
 * --demo : crée les profils FICTIFS de démonstration (développement seulement).
 */
import { writeFileSync } from 'node:fs';
import { importReportMarkdown, loadEdition } from '@awform/content';
import { seedDemo } from '../attempts.js';
import { connect, resetTestDatabase, runMigrations } from '../client.js';
import { contentDir, loadRootEnv } from '../env.js';
import { importEdition } from '../import.js';

loadRootEnv();
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const code = opt('--edition', process.env.AWFORM_EDITION ?? 'dev');
// livres GELÉS (ETAT.md) ; « --apercu » : livres pas encore gelés, marqués « aperçu » (démonstration seulement)
const levels = opt('--levels', process.env.AWFORM_LEVELS ?? 'en1,ad1,en2,ad2,re1,re2')
  .split(',')
  .filter(Boolean);
const apercu = opt('--apercu', process.env.AWFORM_APERCU ?? '')
  .split(',')
  .filter(Boolean);
const rapport = opt('--rapport', '');
const url = args.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

const load = loadEdition({ contentDir: contentDir(), levels: [...levels, ...apercu] });
for (const lv of load.levels)
  if (apercu.includes(lv.code)) lv.book = { ...lv.book, apercu: true } as typeof lv.book;
if (rapport) writeFileSync(rapport, importReportMarkdown(load, code));
const h = connect(url, 2);
try {
  // --reset : base de TEST seulement (refus sur toute autre base)
  if (args.includes('--reset')) {
    if (!args.includes('--test')) throw new Error('--reset exige --test');
    await resetTestDatabase(h.pool);
  }
  await runMigrations(h.db);
  const r = await importEdition(h.db, load, {
    code,
    publish: args.includes('--publish'),
    replace: args.includes('--replace'),
  });
  if (args.includes('--demo')) await seedDemo(h.db);
  const v = load.verseStats;
  console.log(
    `Édition ${code} : ${r.status} (${r.units} unités, ${r.exercises} exercices, ${load.illustrations?.size ?? 0} illustrations) ; versets ${v.total} contrôlés, ${v.erreurs} erreur ; avertissements ${load.issues.length}`,
  );
} finally {
  await h.close();
}
