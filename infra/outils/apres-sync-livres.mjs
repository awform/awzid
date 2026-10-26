// Après une synchronisation des livres (26/10/2026) : liste les NOUVEAUX textes « à écouter » des leçons qui n'ont pas
// encore d'audio, c'est-à-dire ce que les livres corrigés ont ajouté ou modifié par rapport à l'ancienne copie.
// Aucun audio n'est généré ici : le fichier sert de liste d'attente à l'équipe audio.
//
// Usage (depuis packages/content, après `pnpm build`) :
//   node ../../infra/outils/apres-sync-livres.mjs --avant ~/awform-content.avant-26-10 --apres ~/awform-content \
//        [--liste ~/lecons-audio/liste.csv] [--out data/zero-muet/apres-sync-livres.tsv]
// Méthode : celle du test « zéro muet » (`test/zero-muet.test.ts`) : pour chaque leçon des livres proposés en vidéo, le
// générateur de vidéos (`buildVideo`) dit quels textes seraient dits sans fichier audio (`sansSon`) ; on garde ceux qui ne
// l'étaient pas dans l'ancienne copie. Un texte n'est jamais modifié ni retapé : il est copié de la source.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const racine = process.cwd();
const dist = (f) => import(pathToFileURL(join(racine, 'dist', f)).href);
const { audioFileId } = await dist('audio-cle.js');
const { buildVideo } = await dist('video.js');
const { VIDEO_NIVEAUX } = await dist('video-niveaux.js');
const { parseDataFile, studentProjection } = await dist('index.js');

const avant = arg('avant');
const apres = arg('apres', join(homedir(), 'awform-content'));
const liste = arg('liste', join(homedir(), 'lecons-audio', 'liste.csv'));
const out = arg('out', join(racine, 'data', 'zero-muet', 'apres-sync-livres.tsv'));
if (!avant || !existsSync(join(avant, 'data')))
  throw new Error('--avant : ancienne copie des livres introuvable');

const BOM = String.fromCharCode(0xfeff);
const fichiers = new Map();
for (const l of readFileSync(liste, 'utf8').split('\n').slice(1)) {
  const c = l.split(';');
  if (c.length < 6) continue;
  fichiers.set(c[0].replace(BOM, ''), new Set((c[5] ?? '').split(' ').filter(Boolean)));
}
const aSonFichier = (texte, niveau) => {
  const id = audioFileId(texte);
  return !!id && !!fichiers.get(id)?.has(niveau);
};
const audiosDe = (niveau) => [...fichiers].filter(([, n]) => n.has(niveau)).map(([sha]) => sha);
const strings = (v, o = []) => {
  if (typeof v === 'string') o.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, o));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, o));
  return o;
};

/** textes sans fichier d'une leçon : Map texte → partie */
function sansSon(dossier, livre, f) {
  const p = join(dossier, 'data', livre, f);
  if (!existsSync(p)) return null;
  const brut = parseDataFile(readFileSync(p, 'utf8'), f).value;
  const L = studentProjection(brut, livre);
  const images = new Set(strings([L.mots, L.exercices]).filter((s) => /^[a-z_]+$/.test(s)));
  const v = buildVideo(L, {
    unitId: `${livre}.${f.slice(0, 3)}`,
    hasAudio: (s) => aSonFichier(s, livre),
    images,
    audioList: audiosDe(livre),
  });
  const m = new Map();
  for (const s of v.sansSon)
    if (/[\p{L}\p{N}]/u.test(s.texte) && !m.has(s.texte)) m.set(s.texte, s.part);
  return m;
}

/** parties que le test « zéro muet » compte comme « à écouter » ; les autres (quiz, récapitulatif) sont dites par la vidéo */
const ESSENTIEL = new Set(['lettres', 'lecture', 'mots', 'dialogue', 'resume']);
const lignes = ['livre\tleçon\tpartie\ttexte\tfichier audio (id)\tétat'];
let n = 0;
for (const livre of VIDEO_NIVEAUX) {
  const d = join(apres, 'data', livre);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)
    .filter((x) => /^l\d+\.js$/.test(x))
    .sort()) {
    const B = sansSon(apres, livre, f);
    const A = sansSon(avant, livre, f) ?? new Map();
    for (const [texte, part] of B) {
      if (A.has(texte)) continue; // déjà sans audio avant : pas nouveau
      lignes.push(
        [
          livre,
          f.slice(0, -3),
          part,
          texte.replace(/\s+/g, ' '),
          audioFileId(texte) ?? '',
          ESSENTIEL.has(part)
            ? 'nouveau texte sans audio (compté par le test zéro muet)'
            : 'nouveau texte sans audio (quiz ou récapitulatif de la vidéo)',
        ].join('\t'),
      );
      n++;
    }
  }
}
writeFileSync(out, lignes.join('\n') + '\n');
console.log(`${n} nouveaux textes sans audio -> ${out}`);
