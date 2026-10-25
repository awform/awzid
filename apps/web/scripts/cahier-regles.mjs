// Cahier de lecture, niveau 1 (25/10/2026) — RÈGLES D'ENSEIGNEMENT des livres en1 et ado1, pour la construction des jeux :
// à quelle leçon (numéro de fichier de leçon du livre, `l07` → 7) chaque lettre et chaque signe sont-ils ENSEIGNÉS ?
// Un texte (syllabe, mot) est « vu » à la leçon N quand toutes ses lettres et tous ses signes sont enseignés au plus tard
// à la leçon N. Cette règle sert (1) au générateur des données (scripts/cahier-donnees.mjs : `n` de chaque case de grille
// et de chaque item de jeu), (2) au test (src/lib/cahier/jeux.test.ts) qui la refait SANS passer par les données.
// Aucun texte arabe tapé ici : les lettres et les signes sont désignés par leur code. Le texte arabe analysé n'est
// jamais modifié (ni NFC, ni reclassement).

const c = (...cs) => String.fromCharCode(...cs);
/** signes (marques) : code → clé */
const MARQUE = {
  0x64e: 'fatha',
  0x650: 'kasra',
  0x64f: 'damma',
  0x652: 'soukoun',
  0x64b: 'fathatan',
  0x64d: 'kasratan',
  0x64c: 'dammatan',
  0x651: 'shadda',
};
/** clé de signe → marques (chaîne) ; la chadda précède sa voyelle (graphie du cahier) */
export const MARQUES = {
  fatha: c(0x64e),
  kasra: c(0x650),
  damma: c(0x64f),
  soukoun: c(0x652),
  fathatan: c(0x64b),
  kasratan: c(0x64d),
  dammatan: c(0x64c),
  shadda_fatha: c(0x651, 0x64e),
  shadda_kasra: c(0x651, 0x650),
  shadda_damma: c(0x651, 0x64f),
};
export const CLES_SIGNES = Object.keys(MARQUES);
const L = {
  alif: c(0x627),
  waw: c(0x648),
  ya: c(0x64a),
  hamzaAlif: [c(0x623), c(0x625)],
  hamzaSiege: [c(0x624), c(0x626), c(0x621)],
  taMarbuta: c(0x629),
  maqsura: c(0x649),
};

/**
 * Ordre d'enseignement (numéros de fichier de leçon) — d'après les plans PLAN_CAHIER.md et les concordances du cahier :
 *  - en1 : voyelles brèves L1-L3 (l01-l03), hamza sur l'alif en tête de mot avec l'alif (l15), sons longs l18 (َا), l19
 *    (ُو), l20 (ِي), soukoun l21, tanwīn et ة l23, chadda l24 ; ni article, ni ى, ni hamza sur siège.
 *  - ado1 : voyelles brèves l01, hamza sur l'alif en tête de mot l04, sons longs et soukoun l06, tanwīn et chadda l07,
 *    ة, ى et article l08, hamza et sièges l09.
 * `null` : pas enseigné dans ce livre (le texte n'est jamais « vu »).
 */
export const REGLES = {
  en1: {
    fatha: 1,
    kasra: 2,
    damma: 3,
    longA: 18,
    longU: 19,
    longI: 20,
    soukoun: 21,
    tanwin: 23,
    shadda: 24,
    taMarbuta: 23,
    maqsura: null,
    hamzaTete: 15,
    hamzaSiege: null,
  },
  ado1: {
    fatha: 1,
    kasra: 1,
    damma: 1,
    longA: 6,
    longU: 6,
    longI: 6,
    soukoun: 6,
    tanwin: 7,
    shadda: 7,
    taMarbuta: 8,
    maqsura: 8,
    hamzaTete: 4,
    hamzaSiege: 9,
  },
};

/** leçon d'enseignement de chaque lettre, lue dans le tableau « les 28 lettres » du cahier (`lecon_n`) */
export function lettresN(src) {
  const t = src.pages.flatMap((p) => p.blocs ?? []).find((b) => b.type === 'table');
  const out = {};
  for (const r of t?.elements ?? []) out[r.lettre] = r.lecon_n;
  return out;
}

const INFINI = Number.POSITIVE_INFINITY;
const estLettre = (ch) => {
  const k = ch.charCodeAt(0);
  return k >= 0x621 && k <= 0x64a && k !== 0x640;
};

/**
 * Analyse d'un mot ou d'une syllabe : segments `{ l: lettre, s: signe }` (`s` = '' pour une lettre sans signe) et leçon
 * requise `n` (Infinity si le texte sort de ce que le jeu sait construire : article, alif waṣla, madda, petit alif,
 * signe inconnu, lettre non enseignée…). Une lettre sans signe n'est valable que comme PROLONGATION (ا après une fatḥa, و
 * après une ḍamma, ي après une kasra, ا après un tanwīn fatḥ) : `fixe: true`.
 */
export function analyser(texte, niveau, lettreN) {
  const R = REGLES[niveau];
  const segs = [];
  let ok = texte.length > 0;
  for (const ch of texte) {
    if (estLettre(ch)) segs.push({ l: ch, m: [] });
    else if (MARQUE[ch.charCodeAt(0)] && segs.length) segs.at(-1).m.push(MARQUE[ch.charCodeAt(0)]);
    else ok = false;
  }
  if (!segs.length) ok = false;
  const out = [];
  let n = 1;
  const exige = (v) => {
    n = Math.max(n, v ?? INFINI);
  };
  segs.forEach((g, i) => {
    const m = g.m;
    let signe = '';
    if (m.length > 1 || (m.length === 1 && m[0] === 'shadda')) {
      const [a, b] = m;
      if (a === 'shadda' && ['fatha', 'kasra', 'damma'].includes(b) && m.length === 2)
        signe = `shadda_${b}`;
      else ok = false;
    } else if (m.length === 1) signe = m[0];
    const prec = out[i - 1]?.s ?? '';
    let fixe = false;
    if (signe === '') {
      const apresFatha = prec === 'fatha' || prec === 'shadda_fatha';
      const apresDamma = prec === 'damma' || prec === 'shadda_damma';
      const apresKasra = prec === 'kasra' || prec === 'shadda_kasra';
      const prolongation =
        g.l === L.alif && apresFatha
          ? R.longA
          : g.l === L.waw && apresDamma
            ? R.longU
            : g.l === L.ya && apresKasra
              ? R.longI
              : g.l === L.alif && prec === 'fathatan'
                ? R.tanwin
                : undefined;
      if (prolongation === undefined) ok = false;
      else {
        fixe = true;
        exige(prolongation);
      }
    }
    // lettre
    if (g.l === L.taMarbuta) {
      if (i !== segs.length - 1) ok = false;
      exige(R.taMarbuta);
    } else if (g.l === L.maqsura) exige(R.maqsura);
    else if (L.hamzaAlif.includes(g.l))
      exige(i === 0 ? Math.max(R.hamzaTete ?? INFINI, lettreN[L.alif] ?? 0) : R.hamzaSiege);
    else if (L.hamzaSiege.includes(g.l)) exige(R.hamzaSiege);
    else exige(lettreN[g.l]);
    // signe
    if (signe === 'fatha' || signe === 'kasra' || signe === 'damma') exige(R[signe]);
    else if (signe === 'soukoun') exige(R.soukoun);
    else if (signe.endsWith('tan')) exige(R.tanwin);
    else if (signe.startsWith('shadda_')) {
      exige(R.shadda);
      exige(R[signe.slice(7)]);
    }
    out.push({ l: g.l, s: signe, ...(fixe ? { fixe: true } : {}) });
  });
  // un tanwīn n'est valable qu'en fin de texte (avant l'éventuel alif de prolongation) ; sinon texte écarté
  out.forEach((g, i) => {
    if (g.s.endsWith('tan') && i < out.length - (out[out.length - 1]?.fixe ? 2 : 1)) ok = false;
  });
  return { ok, n: ok ? n : INFINI, segs: out };
}

/** texte reconstitué depuis les segments (lettre + marques) : doit redonner EXACTEMENT le texte analysé */
export const recomposer = (segs) => segs.map((g) => g.l + (MARQUES[g.s] ?? '')).join('');

/** signes enseignés à la leçon `n` (clés), dans l'ordre d'enseignement du tableau des signes du jeu */
export function signesEnseignes(niveau, n) {
  const R = REGLES[niveau];
  const out = [];
  for (const k of ['fatha', 'kasra', 'damma']) if (R[k] <= n) out.push(k);
  if (R.soukoun <= n) out.push('soukoun');
  if (R.tanwin <= n) out.push('fathatan', 'kasratan', 'dammatan');
  if (R.shadda <= n) {
    for (const k of ['fatha', 'kasra', 'damma']) if (R[k] <= n) out.push(`shadda_${k}`);
  }
  return out;
}

/** premier numéro de leçon (parmi ceux de `niveau`) où `signe` est enseigné */
export function leconDuSigne(niveau, signe) {
  const R = REGLES[niveau];
  if (signe === 'soukoun') return R.soukoun;
  if (signe.endsWith('tan')) return R.tanwin;
  if (signe.startsWith('shadda_')) return Math.max(R.shadda, R[signe.slice(7)]);
  return R[signe];
}
