#!/usr/bin/env node
/**
 * Lot F2 — mots du Coran rattachés au niveau de livre qui les enseigne (décision du client du 05/10/2026) :
 *   node dist/cli/mots-coran.js --source <chemin>/mots_coran_1000.json [--test]
 * Lit le fichier des livres (rang, clé du lemme, forme arabe, niveau_enfants E1-E5, niveau_adultes A1-A10),
 * idempotent ; rien n'est écrit à la main. Le rattachement aux LEÇONS (et aux livres des ados) viendra quand les
 * livres l'exporteront.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, runMigrations } from '../client.js';
import { loadRootEnv } from '../env.js';
import { importQuranLemmas, type LemmaSource } from '../niveaux.js';

loadRootEnv();
const args = process.argv.slice(2);
const at = args.indexOf('--source');
const src = at >= 0 ? args[at + 1] : undefined;
if (!src) throw new Error('--source <mots_coran_1000.json> requis');
const raw = readFileSync(src);
const data = JSON.parse(raw.toString('utf8')) as LemmaSource;
if (!Array.isArray(data.lemmes) || !data.lemmes.length) throw new Error('fichier sans « lemmes »');
const h = connect(
  args.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  2,
);
try {
  await runMigrations(h.db);
  const r = await importQuranLemmas(h.db, data, createHash('sha256').update(raw).digest('hex'));
  console.log(JSON.stringify(r));
} finally {
  await h.close();
}
