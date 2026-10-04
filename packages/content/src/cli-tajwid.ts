#!/usr/bin/env node
/**
 * Lot 29 — génère les fichiers du tajwid en couleurs (un par sourate) calés sur NOTRE texte Tanzil :
 *   node dist/cli-tajwid.js [--dir ~/awform-content] [--out ../../apps/web/static/tajwid] [--check]
 * Sources (dans le dépôt, voir docs/projet/LICENCES.md) : tajwid-source/*.gz. Avec --check : rien n'est écrit,
 * code de sortie 1 si les fichiers du dépôt diffèrent de ce que donne la source.
 * Code de sortie 1 au moindre écart de calage (aucun fichier partiel).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadTanzil } from './quran.js';
import { buildTajwid, parsePipeText, TAJWID_RULES, type SourceAnnotation } from './tajwid.js';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE_DIR = join(here, '..', 'tajwid-source');
export const SOURCE_JSON = 'cpfair-quran-tajweed-496f71c.hafs.uthmani-pause-sajdah.json.gz';
export const SOURCE_TEXT = 'tanzil-quran-uthmani-1.0.2-2017-04.txt.gz';

export function readSources(dir = SOURCE_DIR) {
  const source = JSON.parse(
    gunzipSync(readFileSync(join(dir, SOURCE_JSON))).toString('utf8'),
  ) as Array<{
    surah: number;
    ayah: number;
    annotations: SourceAnnotation[];
  }>;
  const ref = parsePipeText(gunzipSync(readFileSync(join(dir, SOURCE_TEXT))).toString('utf8'));
  return { source, ref };
}

/** Texte JSON d'un fichier de sourate (une ligne par verset : diff lisibles). */
export const suraJson = (x: ReturnType<typeof buildTajwid>[number]) =>
  `{"v":1,"s":${x.s},"src":${JSON.stringify(x.src)},"a":[\n${x.a.map((e) => JSON.stringify(e)).join(',\n')}\n]}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let dir = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
  let out = join(here, '..', '..', '..', 'apps', 'web', 'static', 'tajwid');
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = args[++i] ?? dir;
    else if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--check') check = true;
  }
  const tanzil = loadTanzil(readFileSync(join(dir, 'coran', 'tanzil-uthmani.tsv'), 'utf8'));
  const { source, ref } = readSources();
  const suras = buildTajwid(source, ref, tanzil);
  const counts = new Array(TAJWID_RULES.length).fill(0) as number[];
  let bytes = 0;
  let diff = 0;
  if (!check) mkdirSync(out, { recursive: true });
  for (const x of suras) {
    for (const e of x.a) for (let k = 1; k < e.length; k += 3) counts[e[k] as number]!++;
    const body = suraJson(x);
    bytes += Buffer.byteLength(body);
    const file = join(out, `${String(x.s).padStart(3, '0')}.json`);
    if (check) {
      let cur = '';
      try {
        cur = readFileSync(file, 'utf8');
      } catch {
        /* absent */
      }
      if (cur !== body) diff++;
    } else writeFileSync(file, body);
  }
  console.log(
    `tajwid : 114 sourates, ${counts.reduce((a, b) => a + b, 0)} annotations, ${(bytes / 1024).toFixed(1)} Ko (non compressé)`,
  );
  console.log(TAJWID_RULES.map((r, i) => `${r} ${counts[i]}`).join(', '));
  if (check && diff) {
    console.error(`${diff} fichier(s) diffèrent de la source : relancer sans --check`);
    process.exit(1);
  }
}
