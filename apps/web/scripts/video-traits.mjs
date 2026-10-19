// Vidéos vivantes — tracé des lettres : écrit `static/video/traits.json` depuis `docs/ecriture/traits_lettres.json`
// (recherche sourcée, 2ᵉ passe : Alif Baa, Georgetown University Press ; tableau naskh de M. Sakkal ; voir
// docs/ecriture/SENS_DES_TRAITS.md, § 2P qui fait foi) et la DÉCISION du référent (19/10/2026, mise à jour) :
//  - VALIDÉES : toutes les formes de statut « sur », « probable » et « divergent » ; pour « divergent », la
//    variante `recommandee` (مـ au début : sens horaire ; كـ et ـكـ : le corps d'abord, la barre le mot fini) ;
//  - NON VALIDÉE : la forme « insuffisant » (ـلا après liaison) : montrée complète, sans animation.
// Le statut reste écrit dans le fichier servi (`s`), pour pouvoir n'afficher plus tard que les formes « sur ».
// Relancer `node scripts/video-traits.mjs` après toute nouvelle version des données, puis `pnpm test`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', '..', 'docs', 'ecriture', 'traits_lettres.json');
const out = join(root, 'static', 'video', 'traits.json');
const FORMES = ['isolee', 'debut', 'milieu', 'fin'];

/** Décision du référent : statuts dont le tracé est montré. */
export const STATUTS_VALIDES = ['sur', 'probable', 'divergent'];

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

/** Données sources (version, statuts) */
export const source = () => JSON.parse(readFileSync(src, 'utf8'));

/** Forme de la famille désignée par une lettre (« dent », « dal.isolee »…), ou undefined. */
export function forme(j, ref, f) {
  const [fam, sous] = ref.split('.');
  return j.familles[fam]?.[sous ?? f];
}

/** Par lettre : [isolée, début, milieu, fin], chaque forme { s: statut, t: traits } si validée, sinon null. */
export function traits() {
  const j = source();
  const res = {};
  for (const [l, def] of Object.entries(j.lettres)) {
    res[l] = FORMES.map((f) => {
      const ref = def.formes[f];
      if (!ref) return null;
      const x = forme(j, ref, f);
      if (!x) throw new Error(`tracé absent : ${ref} (${f})`);
      if (!STATUTS_VALIDES.includes(x.statut)) return null;
      const tr = x.variantes ? x.variantes[x.recommandee]?.traits : x.traits;
      if (!tr) throw new Error(`variante recommandée absente : ${ref} (${f})`);
      return {
        s: x.statut,
        t: tr
          .slice()
          .sort((a, b) => a.n - b.n)
          .map((t) =>
            superposer(t)
              .flat()
              .map((v) => Math.round(v * 100)),
          ),
      };
    });
  }
  return res;
}

/**
 * Fichier servi à la demande (`/video/traits.json`, chargé au premier tracé, gardé au téléchargement d'un niveau) :
 * par lettre, [isolée, début, milieu, fin] ; chaque forme validée = { s: statut, t: ses traits dans l'ordre (points
 * de passage x, y en centièmes : x de 0 = bord gauche à 100 = bord droit, y de 0 = ligne de base à 100 = hauteur de
 * l'alif) } ; null : forme non validée, montrée complète sans animation. Les marques viennent après le corps.
 */
export const contenu = () =>
  `${JSON.stringify({ _: `GÉNÉRÉ par scripts/video-traits.mjs (docs/ecriture/traits_lettres.json v${source().version} et décision du référent du 19/10/2026) : ne pas modifier à la main`, ...traits() })}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, contenu());
  console.log(`écrit : ${out}`);
}
