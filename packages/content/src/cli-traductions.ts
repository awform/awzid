#!/usr/bin/env node
/**
 * Muṣḥaf par page — traductions du sens (QuranEnc.com), un fichier par sourate et par traduction :
 *   node dist/cli-traductions.js [--out ../../apps/web/static/traductions] [--check]
 * Sources (dans le dépôt, voir docs/projet/LICENCES.md § 4) : traduction-source/*.sqlite.gz, fichiers SQLite
 * officiels de QuranEnc gardés tels quels. Conditions de QuranEnc : AUCUNE modification, ajout ni suppression
 * (texte et notes recopiés à l'identique), source et version indiquées, mise à jour depuis la source.
 * Avec --check : rien n'est écrit ; code de sortie 1 si les fichiers du dépôt diffèrent de la source.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
export const TRANSLATION_SOURCE_DIR = join(here, '..', 'traduction-source');

export interface TranslationSource {
  key: string;
  version: string;
  file: string;
  /** SHA-256 du fichier SQLite d'origine (décompressé), consigné dans LICENCES.md */
  sha256: string;
}

/** Traductions retenues (licence QuranEnc vérifiée le 04/10/2026). */
export const TRANSLATIONS: readonly TranslationSource[] = [
  {
    key: 'french_rashid',
    version: '1.0.3',
    file: 'quranenc-french_rashid-1.0.3.sqlite.gz',
    sha256: '1c8d1f66f3ab8d708ba84db79b8c069dede23a3e40fff253d3ca14deafba87bf',
  },
  {
    key: 'english_rwwad',
    version: '1.0.19',
    file: 'quranenc-english_rwwad-1.0.19.sqlite.gz',
    sha256: '77e2ede3d8e6d6b5c6e16ff78eda2d2b6cc0a6b7489c94a5dde4f7481f5fdee8',
  },
];

export interface TranslationRow {
  s: number;
  a: number;
  text: string;
  notes: string;
}

/** Lit une source : contrôle l'empreinte, renvoie les 6 236 versets dans l'ordre (texte tel quel). */
export function readTranslation(src: TranslationSource, dir = TRANSLATION_SOURCE_DIR) {
  const raw = gunzipSync(readFileSync(join(dir, src.file)));
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== src.sha256) throw new Error(`${src.key} : empreinte ${sha} ≠ ${src.sha256}`);
  const tmp = mkdtempSync(join(tmpdir(), 'awzid-trad-'));
  try {
    const path = join(tmp, 'source.sqlite');
    writeFileSync(path, raw);
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db
      .prepare('SELECT sura, aya, translation, footnotes FROM translations ORDER BY sura, aya')
      .all() as Array<{
      sura: number;
      aya: number;
      translation: string | null;
      footnotes: string | null;
    }>;
    db.close();
    return rows.map((r): TranslationRow => ({
      s: Number(r.sura),
      a: Number(r.aya),
      text: r.translation ?? '',
      notes: r.footnotes ?? '',
    }));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Texte JSON d'un fichier de sourate (une ligne par verset : diff lisibles). */
export function suraTranslationJson(src: TranslationSource, s: number, rows: TranslationRow[]) {
  const body = rows.map((r) => JSON.stringify([r.a, r.text, r.notes])).join(',\n');
  return `{"v":1,"key":${JSON.stringify(src.key)},"version":${JSON.stringify(src.version)},"source":"QuranEnc.com","s":${s},"t":[\n${body}\n]}\n`;
}

/** Fichiers attendus : chemin relatif → contenu. */
export function buildTranslations(dir = TRANSLATION_SOURCE_DIR): Map<string, string> {
  const out = new Map<string, string>();
  for (const src of TRANSLATIONS) {
    const rows = readTranslation(src, dir);
    for (let s = 1; s <= 114; s++) {
      const mine = rows.filter((r) => r.s === s);
      out.set(`${src.key}/${String(s).padStart(3, '0')}.json`, suraTranslationJson(src, s, mine));
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let out = join(here, '..', '..', '..', 'apps', 'web', 'static', 'traductions');
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--check') check = true;
  }
  let diff = 0;
  let bytes = 0;
  for (const [rel, body] of buildTranslations()) {
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
  console.log(
    `${check ? 'contrôle' : 'écrit'} : ${TRANSLATIONS.length} traductions, ${bytes} octets, ${diff} écart(s)`,
  );
  process.exit(diff ? 1 : 0);
}
