// « La prière de A à Z » (25/10/2026) — CALAGE des fichiers de synthèse des paroles : début et fin du son utile et silences,
// mesurés UNE FOIS dans chaque fichier (ffmpeg « silencedetect »), pour que le mot entendu s'éclaire au bon moment. Sans mesure,
// l'application répartit le texte sur tout le fichier (au prorata des lettres). À relancer quand de nouveaux fichiers arrivent.
// Écrit static/priere-data/calage.json : { format: 1, v, calage: { <sha1>: { a, b, s: [[début, fin], …] } } } (secondes).
// Usage : node scripts/priere-calage.mjs [dossier-des-mp3] [liste.csv]   (défaut : ~/lecons-audio)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classer, collecter, lireListe } from './priere-audio.mjs';
import { SORTIE, SOURCE } from './priere-donnees.mjs';

/** seuil et durée minimale d'un silence entre deux membres de phrase */
const BRUIT = '-35dB';
const DUREE_MIN = 0.18;
const r2 = (x) => Math.round(x * 100) / 100;

export function mesurer(mp3) {
  const duree = Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
      {
        encoding: 'utf8',
      },
    ).trim(),
  );
  let sortie = '';
  try {
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-i',
        mp3,
        '-af',
        `silencedetect=noise=${BRUIT}:d=${DUREE_MIN}`,
        '-f',
        'null',
        '-',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
  } catch (e) {
    sortie = String(e.stderr ?? '');
  }
  return { duree, ...analyser(sortie, duree) };
}

/** analyse de la sortie de silencedetect : silences intérieurs, début et fin du son */
export function analyser(texte, duree) {
  const debuts = [...texte.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) =>
    Math.max(0, Number(m[1])),
  );
  const fins = [...texte.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = [];
  let a = 0;
  let b = duree;
  debuts.forEach((d, i) => {
    const f = fins[i];
    if (d <= 0.05 && f !== undefined)
      a = f; // silence de tête
    else if (f === undefined)
      b = d; // silence de queue (jamais refermé)
    else silences.push([r2(d), r2(f)]);
  });
  return { a: r2(a), b: r2(b), s: silences };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const dossier = process.argv[2] ?? join(homedir(), 'lecons-audio');
  const liste = lireListe(process.argv[3] ?? join(dossier, 'liste.csv'));
  const priere = JSON.parse(readFileSync(join(SOURCE, 'priere.json'), 'utf8'));
  const { existants } = classer(collecter(priere), liste);
  const calage = {};
  for (const x of existants) {
    const f = join(dossier, `${x.sha}.mp3`);
    if (!existsSync(f)) continue;
    const m = mesurer(f);
    calage[x.sha] = { a: m.a, b: m.b, s: m.s };
  }
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(
    join(SORTIE, 'calage.json'),
    `${JSON.stringify({ format: 1, v: 'calage', calage })}\n`,
  );
  console.log(`calage : ${Object.keys(calage).length} fichiers mesurés`);
}
