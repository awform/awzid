#!/usr/bin/env node
/**
 * Tafsīr abrégé et mot à mot — génère les 114 fichiers `packages/content/tafsir/NNN.json` (+ `meta.json`) :
 *   node dist/cli-tafsir.js --src <dossier des fichiers du référent> [--out ../tafsir] [--tanzil <tsv>] [--check]
 * `--src` : le dossier `application/tafsir` du référent (`juz_amma.json`, `bloc*_*.json`) ; al-Fātiḥa vient de
 * `data/priere/sourates.json` (dans le dépôt). Texte coranique contrôlé OCTET PAR OCTET contre le TSV Tanzil du dépôt
 * (`madjaliss-source/coran/tanzil-uthmani.tsv`, ou `--tanzil`). Avec --check : rien n'est écrit, code de sortie 1 si les
 * fichiers du dépôt diffèrent de ce que donne la source. Code de sortie 1 au moindre écart (aucun fichier partiel).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTanzil } from './quran.js';
import {
  construireSourate,
  sourateJson,
  TAFSIR_VERSION,
  type SourateTafsir,
  type SourceSourate,
} from './tafsir.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_TAFSIR = join(here, '..', 'tafsir');
const FICHIER = /^(juz_amma|bloc\d+_[\d-]+)\.json$/;

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Lit les fichiers du référent : toutes les sourates, par numéro (al-Fātiḥa en plus, depuis le dépôt). */
export function lireSource(src: string, fatiha: string) {
  const empreintes: Record<string, string> = {};
  const parNumero = new Map<number, SourceSourate>();
  const erreurs: string[] = [];
  const noms = readdirSync(src)
    .filter((f) => FICHIER.test(f))
    .sort();
  for (const f of noms) {
    const brut = readFileSync(join(src, f));
    empreintes[f] = sha(brut);
    const d = JSON.parse(brut.toString('utf8')) as { sourates: SourceSourate[] };
    for (const s of d.sourates) {
      if (parNumero.has(s.numero)) erreurs.push(`sourate ${s.numero} présente dans deux fichiers`);
      parNumero.set(s.numero, s);
    }
  }
  const brut = readFileSync(fatiha);
  empreintes['data/priere/sourates.json#1'] = sha(brut);
  const p = JSON.parse(brut.toString('utf8')) as { sourates: SourceSourate[] };
  const f1 = p.sourates.find((s) => s.numero === 1);
  if (!f1) erreurs.push('al-Fātiḥa absente de data/priere/sourates.json');
  else if (parNumero.has(1)) erreurs.push('sourate 1 présente dans deux sources');
  else parNumero.set(1, f1);
  return { parNumero, empreintes, erreurs, fichiers: noms.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let src = '';
  let out = DOSSIER_TAFSIR;
  let tanzilTsv = join(here, '..', 'madjaliss-source', 'coran', 'tanzil-uthmani.tsv');
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--src') src = args[++i] ?? src;
    else if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--tanzil') tanzilTsv = args[++i] ?? tanzilTsv;
    else if (args[i] === '--check') check = true;
  }
  if (!src || !existsSync(src)) {
    console.error('--src <dossier des fichiers du référent> est obligatoire');
    process.exit(2);
  }
  const tanzil = loadTanzil(readFileSync(tanzilTsv, 'utf8'));
  const fatiha = join(here, '..', 'data', 'priere', 'sourates.json');
  const { parNumero, empreintes, erreurs, fichiers } = lireSource(src, fatiha);
  const sorties: SourateTafsir[] = [];
  for (let n = 1; n <= 114; n++) {
    const s = parNumero.get(n);
    if (!s) {
      erreurs.push(`sourate ${n} absente de la source`);
      continue;
    }
    const r = construireSourate(s, tanzil);
    erreurs.push(...r.erreurs);
    sorties.push(r.sourate);
  }
  for (const e of erreurs) console.error(`  ✗ ${e}`);
  if (erreurs.length) {
    console.error(`${erreurs.length} écart(s) : rien n'est écrit`);
    process.exit(1);
  }
  const versets = sorties.reduce((a, x) => a + x.versets.length, 0);
  const mots = sorties.reduce((a, x) => a + x.versets.reduce((b, v) => b + v.mots.length, 0), 0);
  const points = sorties.reduce((a, x) => a + x.points.length, 0);
  const marques = sorties.reduce((a, x) => a + x.points.filter((p) => p.acces).length, 0);
  const meta = {
    v: TAFSIR_VERSION,
    sourates: sorties.length,
    versets,
    mots,
    points,
    points_marques: marques,
    source: empreintes,
  };
  const corpsMeta = `${JSON.stringify(meta, null, 2)}\n`;
  let diff = 0;
  let octets = 0;
  if (!check) mkdirSync(out, { recursive: true });
  const ecrire = (nom: string, corps: string) => {
    octets += Buffer.byteLength(corps);
    const f = join(out, nom);
    if (check) {
      if (!existsSync(f) || readFileSync(f, 'utf8') !== corps) {
        console.error(`  ≠ ${nom}`);
        diff++;
      }
    } else writeFileSync(f, corps);
  };
  for (const x of sorties) ecrire(`${String(x.s).padStart(3, '0')}.json`, sourateJson(x));
  ecrire('meta.json', corpsMeta);
  console.log(
    `${sorties.length} sourates, ${versets} versets, ${mots} mots, ${points} points (${marques} marqués), ${fichiers} fichiers du référent + al-Fātiḥa, ${(octets / 1048576).toFixed(2)} Mo ; ${diff} fichier(s) différent(s)`,
  );
  if (diff) process.exit(1);
}
