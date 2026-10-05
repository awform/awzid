#!/usr/bin/env node
/**
 * Chantier A8 — muṣḥafs des riwāyāt : textes OFFICIELS du Complexe du Roi Fahd (plateforme développeurs).
 *
 *   node dist/cli-riwayat.js --from ~/complexe-ressources/textes-riwayat
 *       relit les dossiers décompressés du Complexe : contrôle les empreintes (JSON et police), garde le JSON
 *       compressé TEL QUEL dans riwayat-source/ et copie la police SANS MODIFICATION dans
 *       apps/web/static/riwayat/<riwāya>/ ;
 *   node dist/cli-riwayat.js [--out ../../apps/web/static/riwayat] [--check]
 *       produit, depuis riwayat-source/, un fichier par sourate (texte recopié sans changement) et l'index de
 *       chaque riwāya (comptes, débuts de page, juzʾ) ; avec --check, rien n'est écrit et le code de sortie
 *       est 1 si les fichiers livrés diffèrent de la source ou si un contrôle échoue.
 * Aucune normalisation (pas de NFC), rien de retapé : le texte livré est la chaîne lue dans le JSON du Complexe.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  checkRiwaya,
  readRiwayaRows,
  riwayaIndex,
  RIWAYA_TEXTS,
  type RiwayaText,
  type RiwayaVerse,
} from './riwayat.js';

const here = dirname(fileURLToPath(import.meta.url));
export const RIWAYAT_SOURCE_DIR = join(here, '..', 'riwayat-source');
export const RIWAYAT_STATIC_DIR = join(here, '..', '..', '..', 'apps', 'web', 'static', 'riwayat');

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** JSON d'origine (décompressé), empreinte contrôlée. */
export function readRiwayaSource(def: RiwayaText, dir = RIWAYAT_SOURCE_DIR): Buffer {
  const raw = gunzipSync(readFileSync(join(dir, `${def.json}.gz`)));
  const sha = sha256(raw);
  if (sha !== def.jsonSha256) throw new Error(`${def.key} : empreinte ${sha} ≠ ${def.jsonSha256}`);
  return raw;
}

/** Versets d'une riwāya (texte tel quel) après contrôle de l'empreinte ; lève une erreur si un contrôle échoue. */
export function loadRiwaya(def: RiwayaText, dir = RIWAYAT_SOURCE_DIR): RiwayaVerse[] {
  const verses = readRiwayaRows(def, JSON.parse(readRiwayaSource(def, dir).toString('utf8')));
  const errs = checkRiwaya(def, verses);
  if (errs.length)
    throw new Error(`${def.key} : ${errs.length} écart(s) — ${errs.slice(0, 5).join(' ; ')}`);
  return verses;
}

/** Fichier d'une sourate : une ligne par verset [verset, page, juzʾ, texte] (diff lisibles). */
export function suraRiwayaJson(def: RiwayaText, s: number, verses: readonly RiwayaVerse[]): string {
  const body = verses.map((v) => JSON.stringify([v.a, v.page, v.juz, v.text])).join(',\n');
  return (
    `{"v":1,"key":${JSON.stringify(def.key)},"version":${JSON.stringify(def.version)},` +
    `"source":"KFGQPC","s":${s},"name":${JSON.stringify(verses[0]?.suraAr ?? '')},"t":[\n${body}\n]}\n`
  );
}

/** Fichiers attendus (chemin relatif → contenu) pour toutes les riwāyāt. */
export function buildRiwayat(dir = RIWAYAT_SOURCE_DIR): Map<string, string> {
  const out = new Map<string, string>();
  for (const def of RIWAYA_TEXTS) {
    const verses = loadRiwaya(def, dir);
    out.set(`${def.key}/index.json`, `${JSON.stringify(riwayaIndex(def, verses))}\n`);
    for (let s = 1; s <= 114; s++)
      out.set(
        `${def.key}/${String(s).padStart(3, '0')}.json`,
        suraRiwayaJson(
          def,
          s,
          verses.filter((v) => v.s === s),
        ),
      );
  }
  return out;
}

/** Import depuis les dossiers décompressés du Complexe (une fois, ou à chaque nouvelle version). */
function importFrom(root: string, out: string) {
  const find = (dir: string, name: string): string | null => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) {
        const hit = find(p, name);
        if (hit) return hit;
      } else if (f.name === name) return p;
    }
    return null;
  };
  mkdirSync(RIWAYAT_SOURCE_DIR, { recursive: true });
  for (const def of RIWAYA_TEXTS) {
    const json = find(root, def.json);
    const font = find(root, def.font);
    if (!json || !font) throw new Error(`${def.key} : ${def.json} ou ${def.font} introuvable`);
    const raw = readFileSync(json);
    if (sha256(raw) !== def.jsonSha256)
      throw new Error(`${def.key} : empreinte du JSON différente`);
    if (sha256(readFileSync(font)) !== def.fontSha256)
      throw new Error(`${def.key} : empreinte de la police différente`);
    // gzip déterministe (sans date) : le fichier d'origine est retrouvé octet pour octet par gunzip
    writeFileSync(join(RIWAYAT_SOURCE_DIR, `${def.json}.gz`), gzipSync(raw, { level: 9 }));
    mkdirSync(join(out, def.key), { recursive: true });
    copyFileSync(font, join(out, def.key, def.font));
    console.log(`${def.key} : source et police copiées (empreintes conformes)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let out = RIWAYAT_STATIC_DIR;
  let check = false;
  let from: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--check') check = true;
    else if (args[i] === '--from') from = args[++i] ?? null;
  }
  if (from) importFrom(from, out);
  let diff = 0;
  let bytes = 0;
  for (const [rel, body] of buildRiwayat()) {
    bytes += Buffer.byteLength(body);
    const file = join(out, rel);
    if (check) {
      let have = '';
      try {
        have = readFileSync(file, 'utf8');
      } catch {
        /* absent */
      }
      if (have !== body) diff++;
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
  }
  for (const def of RIWAYA_TEXTS) {
    try {
      if (sha256(readFileSync(join(out, def.key, def.font))) !== def.fontSha256) diff++;
    } catch {
      diff++;
    }
  }
  console.log(
    `${check ? 'contrôle' : 'écrit'} : ${RIWAYA_TEXTS.length} riwāyāt, ${bytes} octets, ${diff} écart(s)`,
  );
  process.exit(diff ? 1 : 0);
}
