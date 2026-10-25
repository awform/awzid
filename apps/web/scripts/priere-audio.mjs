// « La prière de A à Z » (25/10/2026) — audio des PAROLES : quels textes ont déjà un fichier de synthèse, lesquels restent à
// générer. Aucune génération ici : deux tableaux (TSV) pour l'exploitation.
//  - audio_a_generer.tsv : les textes `tts` du parcours sans fichier (le niveau d'audio du parcours est « priere ») ;
//  - audio_existant.tsv : les textes qui ont déjà un fichier (index des leçons) : à étiqueter « priere » à l'installation pour
//    que l'application les trouve (`GET /api/v1/lecons-audio/niveaux/priere`) ;
//  - les textes INTERDITS à la synthèse (basmala, graphie du Muṣḥaf) ne sont ni à générer ni à étiqueter : listés à part.
// Le Coran n'a jamais de fichier de synthèse : il passe par la récitation de Muḥammad Ayyūb (`audio` = `ayyub:S:V`).
// Usage : node scripts/priere-audio.mjs [liste.csv] [dossier-de-sortie]   (défaut : ~/lecons-audio/liste.csv, docs/projet/priere)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioFileId, looksQuranic } from '@awform/content/audio-cle';
import { parcourir, SOURCE } from './priere-donnees.mjs';

/** « \u0628\u0633\u0645 \u0627\u0644\u0644\u0647 » (avec ou sans voyelles) : jamais de synthèse (même règle que `contientBasmala` de src/lib/priere/audio.ts) */
export function contientBasmala(ar) {
  const nu = ar
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\u0671/g, '\u0627')
    .replace(/\s+/g, ' ');
  return /\u0628\u0633\u0645 \u0627\u0644+\u0647/.test(nu);
}

/** Textes à lire par la synthèse : paroles, matn, textes arabes, variantes (`audio` = « tts »). */
export function collecter(priere) {
  const out = [];
  parcourir(priere, (o) => {
    // textes arabes d'une règle (`textes[]`, sans identifiant propre) : identifiés par celui de la règle
    if (Array.isArray(o.textes))
      o.textes.forEach((x, i) => {
        if (typeof x.ar === 'string' && x.audio === 'tts')
          out.push({ id: `${o.id}#textes${i}`, ar: x.ar, type: 'texte', titre: o.titre });
      });
    if (o.id !== undefined && typeof o.ar === 'string' && o.audio === 'tts')
      out.push({ id: o.id, ar: o.ar, type: o.type, titre: o.titre });
    if (o.variante && typeof o.variante.ar === 'string' && o.variante.audio === 'tts')
      out.push({ id: `${o.id}#variante`, ar: o.variante.ar, type: 'variante', titre: o.titre });
  });
  return out;
}

/** Classe les textes : à générer, existants (avec leurs niveaux actuels), interdits. `liste` : sha → { niveaux, texte }. */
export function classer(entrees, liste) {
  const parSha = new Map();
  const interdits = [];
  for (const e of entrees) {
    const raison = contientBasmala(e.ar) ? 'basmala' : looksQuranic(e.ar) ? 'coran' : null;
    if (raison) {
      interdits.push({ ...e, raison });
      continue;
    }
    const sha = audioFileId(e.ar);
    const x = parSha.get(sha) ?? { sha, ar: e.ar, ids: [] };
    if (!x.ids.includes(e.id)) x.ids.push(e.id);
    parSha.set(sha, x);
  }
  const aGenerer = [];
  const existants = [];
  for (const x of parSha.values()) {
    const f = liste.get(x.sha);
    if (f) existants.push({ ...x, niveaux: f.niveaux });
    else aGenerer.push(x);
  }
  return { aGenerer, existants, interdits };
}

/** liste.csv des leçons : sha1;voix;source;statut;caracteres;niveaux;texte */
export function lireListe(chemin) {
  const m = new Map();
  const lignes = readFileSync(chemin, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .slice(1);
  for (const l of lignes) {
    const c = l.split(';');
    if (c[0]) m.set(c[0], { niveaux: c[5] ?? '', texte: c.slice(6).join(';') });
  }
  return m;
}

const tsv = (lignes) => `${lignes.map((l) => l.join('\t')).join('\n')}\n`;

export function tableaux(classes) {
  const caracteres = (s) => [...s].length;
  return {
    'audio_a_generer.tsv': tsv([
      ['sha1', 'niveau', 'ids', 'caracteres', 'texte'],
      ...classes.aGenerer.map((x) => [x.sha, 'priere', x.ids.join(' '), caracteres(x.ar), x.ar]),
    ]),
    'audio_existant.tsv': tsv([
      ['sha1', 'niveaux_actuels', 'a_ajouter', 'ids', 'texte'],
      ...classes.existants.map((x) => [x.sha, x.niveaux, 'priere', x.ids.join(' '), x.ar]),
    ]),
    'audio_interdit_synthese.tsv': tsv([
      ['ids', 'raison', 'texte'],
      ...classes.interdits.map((x) => [x.id, x.raison, x.ar]),
    ]),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chemin = process.argv[2] ?? join(homedir(), 'lecons-audio', 'liste.csv');
  const sortie =
    process.argv[3] ??
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'projet', 'priere');
  const priere = JSON.parse(readFileSync(join(SOURCE, 'priere.json'), 'utf8'));
  const liste = existsSync(chemin) ? lireListe(chemin) : new Map();
  const c = classer(collecter(priere), liste);
  mkdirSync(sortie, { recursive: true });
  for (const [nom, contenu] of Object.entries(tableaux(c)))
    writeFileSync(join(sortie, nom), contenu);
  console.log(
    `à générer : ${c.aGenerer.length} textes ; déjà prêts : ${c.existants.length} ; interdits à la synthèse : ${c.interdits.length} → ${sortie}`,
  );
}
