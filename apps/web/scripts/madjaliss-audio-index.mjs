// Madjaliss — lot 9 : copie COMPACTE de l'index de l'audio de synthèse (`audio\madjaliss\index_madjaliss.json`, produit
// par la génération du 14/10/2026 hors du dépôt) dans les sources du dépôt :
// `packages/content/madjaliss-source/audio_index.json`, lue par `scripts/madjaliss.mjs` (champ `audio` d'une phrase).
// Seuls les champs utiles sont gardés (fichier, octets, SHA-256 du MP3, SHA-1 du texte lu, durée, drapeau adulte) ;
// les raisons des phrases sans audio (notes internes) restent hors du dépôt.
// Usage : node scripts/madjaliss-audio-index.mjs <chemin de index_madjaliss.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
export const AUDIO_INDEX = join(
  web,
  '..',
  '..',
  'packages',
  'content',
  'madjaliss-source',
  'audio_index.json',
);

export function compacter(ix) {
  const textes = {};
  for (const [texte, phrases] of Object.entries(ix.textes ?? {})) {
    textes[texte] = {};
    for (const [id, e] of Object.entries(phrases).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (e.fichier !== `${texte}/${id}.mp3`)
        throw new Error(`${id} : fichier inattendu ${e.fichier}`);
      if (!/^[0-9a-f]{64}$/.test(e.sha256) || !/^[0-9a-f]{40}$/.test(e.texte_sha1))
        throw new Error(`${id} : empreintes`);
      textes[texte][id] = {
        o: e.octets,
        s: e.sha256,
        t: e.texte_sha1,
        d: e.duree_s,
        ...(e.adulte ? { a: true } : {}),
      };
    }
  }
  return { genere: ix.genere, voix: ix.voix, statut: ix.statut, textes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src)
    throw new Error('usage : node scripts/madjaliss-audio-index.mjs <index_madjaliss.json>');
  const ix = JSON.parse(readFileSync(src, 'utf8').replace(/^\uFEFF/, ''));
  const c = compacter(ix);
  writeFileSync(AUDIO_INDEX, `${JSON.stringify(c)}\n`);
  const n = Object.values(c.textes).reduce((s, x) => s + Object.keys(x).length, 0);
  console.log(`${n} phrases avec audio → ${AUDIO_INDEX}`);
}
