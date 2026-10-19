// Vidéos vivantes — tracé des lettres : écrit `static/video/traits.json` depuis `docs/ecriture/traits_lettres.json`
// (recherche sourcée : Alif Baa, Georgetown University Press ; tableau naskh de M. Sakkal) et la DÉCISION du référent
// (19/10/2026) ci-dessous. Seules les formes VALIDÉES sont écrites : une forme absente n'est jamais animée (la lettre
// est montrée complète, sans tracé). Pour valider une forme : l'ajouter à `VALIDES`, relancer
// `node scripts/video-traits.mjs`, puis `pnpm test` (le test compare le fichier à cette source).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', '..', 'docs', 'ecriture', 'traits_lettres.json');
const out = join(root, 'static', 'video', 'traits.json');
const FORMES = ['isolee', 'debut', 'milieu', 'fin'];
const c = (...x) => String.fromCharCode(...x);

/** Décision du référent (19/10/2026) : formes validées (consensus fort) ; tout le reste reste non validé. */
export const VALIDES = {
  [c(0x628)]: FORMES, // bā'
  [c(0x62a)]: FORMES, // tā'
  [c(0x62b)]: FORMES, // thā'
  [c(0x646)]: FORMES, // nūn : début, milieu ; seule et finale
  [c(0x64a)]: ['debut', 'milieu'], // yā'
  [c(0x62f)]: FORMES, // dāl
  [c(0x630)]: FORMES, // dhāl
  [c(0x631)]: ['isolee'], // rā' seule
  [c(0x632)]: ['isolee'], // zāy seule
  [c(0x635)]: FORMES, // ṣād
  [c(0x636)]: FORMES, // ḍād
  [c(0x637)]: FORMES, // ṭā'
  [c(0x638)]: FORMES, // ẓā'
  [c(0x644)]: FORMES, // lām
  [c(0x627)]: FORMES, // alif
  [c(0x639)]: ['debut'], // ʿayn : la tête, au début
  [c(0x63a)]: ['debut'], // ghayn : la tête, au début
  [c(0x623)]: FORMES, // alif hamza dessus
  [c(0x625)]: FORMES, // alif hamza dessous
  [c(0x622)]: FORMES, // alif madda
  [c(0x626)]: ['debut', 'milieu'], // hamza sur yā' (dent)
};

/**
 * Décision du référent : un aller-retour (dent au milieu, hampe atteinte par une liaison) se superpose EXACTEMENT.
 * Pour chaque retour [i, j] (pts[i] → pts[j] repasse sur pts[i-1] → pts[i]), pts[j] est replacé sur ce segment,
 * à sa hauteur (corrige l'écart de 14 unités du prototype de ب).
 */
export function superposer(t) {
  const p = t.pts.map((x) => [...x]);
  for (const [i, j] of t.retours ?? []) {
    const a = p[i - 1];
    const b = p[i];
    if (!a || !b || a[1] === b[1]) continue;
    const k = (p[j][1] - b[1]) / (a[1] - b[1]);
    p[j][0] = b[0] + k * (a[0] - b[0]);
  }
  return p;
}

export function traits() {
  const j = JSON.parse(readFileSync(src, 'utf8'));
  const res = {};
  for (const [l, formes] of Object.entries(VALIDES)) {
    const def = j.lettres[l];
    if (!def)
      throw new Error(`lettre absente de traits_lettres.json : ${l.codePointAt(0).toString(16)}`);
    res[l] = FORMES.map((f) => {
      if (!formes.includes(f) || !def.formes[f]) return null;
      const [fam, sous] = def.formes[f].split('.');
      const forme = j.familles[fam]?.[sous ?? f];
      if (!forme?.traits) throw new Error(`tracé absent : ${fam}.${sous ?? f}`);
      return forme.traits
        .slice()
        .sort((a, b) => a.n - b.n)
        .map((t) =>
          superposer(t)
            .flat()
            .map((v) => Math.round(v * 100)),
        );
    });
  }
  return res;
}

/**
 * Fichier servi à la demande (`/video/traits.json`, chargé au premier tracé, gardé au téléchargement d'un niveau) :
 * par lettre, [isolée, début, milieu, fin] ; chaque forme validée = ses traits dans l'ordre (points de passage x, y
 * en centièmes : x de 0 = bord gauche à 100 = bord droit, y de 0 = ligne de base à 100 = hauteur de l'alif) ; null :
 * forme non validée, montrée complète sans animation. Les marques (points, hamza, madda) viennent après le corps.
 */
export const contenu = () =>
  `${JSON.stringify({ _: 'GÉNÉRÉ par scripts/video-traits.mjs (docs/ecriture/traits_lettres.json et décision du référent du 19/10/2026) : ne pas modifier à la main', ...traits() })}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, contenu());
  console.log(`écrit : ${out}`);
}
