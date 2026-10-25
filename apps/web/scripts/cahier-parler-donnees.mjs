// Cahier « Je parle » (24/10/2026) — données de l'APPLICATION tirées de la source unique du cahier
// (packages/content/data/cahier-parler/<niveau>.json, générée par application/design/cahier_parler_ad2/donnees/etape2_cahier.ps1,
// copie exacte) et de l'habillage des étapes (packages/content/data/cahier-parler/themes.json : thème, pictogramme d'objet,
// accroche) :
//  - static/cahier-data/parler-<niveau>.json : étapes (une par leçon du livre, puis la fin de chaque partie), pages,
//    phrases, conversations et antisèches ; chargé à la demande par le cahier (jamais préchargé : `/cahier-data/` est hors
//    de la coquille du service worker) et gardé sur l'appareil à la première ouverture ;
//  - src/lib/cahier-parler-niveaux.ts : niveaux qui ont un cahier « Je parle » (accès du niveau).
// L'arabe est recopié TEL QUEL (aucune normalisation) : contrôle par src/lib/cahier-parler/parler.test.ts.
// Usage : node scripts/cahier-parler-donnees.mjs [niveau…] (défaut : les 16 niveaux).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
export const NIVEAUX_PARLER = [
  ...['ad2', 'ad3', 'ad4', 'ad5', 'ad6', 'ad7', 'ad8', 'ad9', 'ad10'],
  ...['en2', 'en3', 'en4', 'en5'],
  ...['ado2', 'ado3', 'ado4'],
];
/** étiquette « à qui je parle » d'une phrase sans variations */
const CIBLE = {
  deux: 'à deux personnes',
  groupe: 'à un groupe',
  groupe_f: 'à un groupe de femmes',
};
const TYPE = {
  carte_phrases: 'cartes',
  conversation: 'conversation',
  a_toi_de_parler: 'tuteur',
  revision: 'revision',
  bilan: 'bilan',
};

/** « Partie 1 — Saluer, se présenter (leçons 1 à 5) » → { n, nom, lecons } ; null hors des cinq parties */
export function partie(s) {
  const m = /^Partie (\d+) — (.+?)(?: \((leçons [^)]+)\))?$/.exec(String(s ?? ''));
  return m ? { n: Number(m[1]), nom: m[2], lecons: m[3] ?? '' } : null;
}

/** phrase : formes affichées (une, ou la forme pour un homme puis pour une femme), chacune avec son étiquette */
function phrase(p) {
  const o = { ar: p.ar, fr: p.fr, theme: p.theme };
  const v = p.variations;
  if (v?.masculin && v?.feminin)
    o.f = [v.masculin, v.feminin].map((x) => ({ ar: x.ar, fr: x.fr, u: x.usage }));
  else if (CIBLE[p.cible]) o.u = CIBLE[p.cible];
  return o;
}
const formes = (p) => p.f ?? [{ ar: p.ar, fr: p.fr, ...(p.u ? { u: p.u } : {}) }];

// ---------------------------------------------------------------- niveaux 3 et suivants (25/10/2026)
// Les cahiers des adultes 3 à 10, des enfants 2 à 5 et des ados 2 à 4 portent leur propre habillage (thèmes avec titre,
// pictogramme et accroche ; parties avec leurs thèmes ; antisèche de chaque thème) : une ÉTAPE par thème, dans l'ordre
// des parties du livre, ouverte « après la leçon » où tous ses mots sont connus (`unite`).
/** étiquette « à qui je parle » d'une phrase sans variations (adultes) */
const CIBLE_V3 = {
  a_deux: 'à deux personnes',
  d_elles_deux: "d'elles deux",
  d_elles: "d'elles",
  a_groupe: 'à un groupe',
  a_groupe_f: 'à un groupe de femmes',
  a_groupe_m: "à un groupe d'hommes",
  nous: 'nous',
  d_eux: "d'eux",
  d_eux_deux: "d'eux deux",
  une_femme: 'à une femme',
  un_homme: 'à un homme',
  de_lui: 'de lui',
  d_elle: "d'elle",
};
/** enfants et ados : on parle à un garçon ou à une fille */
const CIBLE_JEUNE = {
  ...CIBLE_V3,
  une_femme: 'à une fille',
  un_homme: 'à un garçon',
  a_groupe_f: 'à un groupe de filles',
  a_groupe_m: 'à un groupe de garçons',
};
const TYPE_V3 = {
  phrase_du_jour: 'cartes',
  carte_phrases: 'cartes',
  conversation: 'conversation',
  a_toi_de_parler: 'tuteur',
};
const DEBUT_ACCROCHE = 'À la fin de cette étape, je sais ';
/** « P001-m » → « P001 » ; « C03.1 » → « C03 » */
const idDe = (r) =>
  String(r)
    .replace(/-(m|f)$/, '')
    .replace(/\..*$/, '');

/** série d'un niveau : « ad » (adultes), « en » (enfants), « ado » (ados) */
export const serieDe = (niveau) => String(niveau).replace(/\d+$/, '');

function convertirV3(src, niveau, habillage) {
  const cibles = serieDe(niveau) === 'ad' ? CIBLE_V3 : CIBLE_JEUNE;
  const parCode = Object.fromEntries(src.themes.map((t) => [t.code, t]));
  const phrases = Object.fromEntries(
    src.phrases.map((p) => {
      const o = { ar: p.ar, fr: p.fr, theme: p.theme };
      const v = p.variations;
      if (v?.masculin && v?.feminin)
        o.f = [v.masculin, v.feminin].map((x) => ({ ar: x.ar, fr: x.fr, u: x.usage }));
      else if (cibles[p.cible]) o.u = cibles[p.cible];
      return [p.id, o];
    }),
  );
  const conversations = Object.fromEntries(
    src.conversations.map((c) => [
      c.id,
      {
        titre: c.titre_fr,
        theme: c.theme,
        A: c.role_A,
        B: c.role_B,
        r: c.repliques.map((r) => ({ q: r.qui, ar: r.ar, fr: r.fr })),
        consigne: c.consigne_tuteur,
      },
    ]),
  );
  for (const x of [...Object.values(phrases), ...Object.values(conversations)])
    if (!parCode[x.theme]) throw new Error(`thème inconnu : ${x.theme}`);
  const connu = (r) => {
    if (!phrases[r] && !conversations[r]) throw new Error(`référence inconnue ${r}`);
    return r;
  };
  const parties = [];
  const etapes = [];
  let num = 0;
  for (const pa of src.parties) {
    const p0 = partie(pa.titre_fr);
    if (!p0) throw new Error(`partie illisible : ${pa.titre_fr}`);
    parties.push(p0);
    for (const code of pa.themes) {
      const t = parCode[code];
      if (!t.accroche_fr.startsWith(DEBUT_ACCROCHE)) throw new Error(`accroche : ${t.accroche_fr}`);
      const pages = src.pages
        .filter((p) => p.theme === code && TYPE_V3[p.type])
        .map((p) => ({
          id: p.id,
          type: TYPE_V3[p.type],
          // le libellé des cartes, des conversations et des scénarios est calculé par l'application
          titre: '',
          refs: p.refs.map(connu),
        }));
      const jour = pages.find((p) => p.type === 'cartes')?.refs[0];
      const f0 = phrases[jour] ? (phrases[jour].f ?? [phrases[jour]])[0] : null;
      if (!f0) throw new Error(`${code} : pas de phrase du jour`);
      num += 1;
      etapes.push({
        id: `e${String(num).padStart(2, '0')}`,
        partie: pa.n,
        n: t.unite,
        pages,
        picto: t.picto,
        num,
        theme: code,
        titre: t.titre_fr,
        accroche: t.accroche_fr.slice(DEBUT_ACCROCHE.length),
        jour: { ar: f0.ar, fr: f0.fr },
        antiseche: t.antiseche.map((a) => [a.ar, a.fr]),
      });
    }
    // fin de partie : révision, situation libre, bilan (une ligne par phrase ou conversation de l'antisèche des thèmes)
    const fin = src.pages.filter((p) => p.partie === pa.n && !p.theme);
    const rev = fin.find((p) => p.type === 'revision');
    const pages = [];
    for (const p of fin) {
      const type = { revision: 'revision', a_toi_de_parler: 'tuteur', bilan: 'bilan' }[p.type];
      if (!type) continue; // carte de voyage : remplacée par le carnet de l'application
      const refs =
        type === 'bilan'
          ? [
              ...new Set(
                p.refs.flatMap((code) =>
                  parCode[code].antiseche.slice(0, 4).map((a) => idDe(a.ref)),
                ),
              ),
            ]
          : p.refs;
      pages.push({ id: p.id, type, titre: p.titre_fr, refs: refs.map(connu) });
    }
    etapes.push({
      id: `fin${pa.n}`,
      partie: pa.n,
      fin: true,
      n: rev.apres_n,
      pages,
      picto: 'etoile',
    });
  }
  // grille finale : une ligne par thème (sa phrase du jour), une étoile par thème
  const finale = src.pages.find((p) => p.type === 'bilan' && !p.refs.length);
  etapes.push({
    id: 'finale',
    partie: 0,
    fin: true,
    n: finale.apres_n,
    pages: [
      {
        id: finale.id,
        type: 'bilan',
        titre: finale.titre_fr,
        refs: src.themes.map((t) => connu(t.phrases[0])),
      },
    ],
    picto: 'etoile',
  });
  return {
    format: 1,
    niveau,
    titre: src.meta.titre,
    version: src.meta.version,
    genere: src.meta.genere_le,
    antiseche_ar: habillage.antiseche_ar,
    themes: Object.fromEntries(src.themes.map((t) => [t.code, t.titre_fr])),
    parties,
    etapes,
    phrases,
    conversations,
  };
}

export function convertir(src, niveau, habillage) {
  if (Array.isArray(src.themes)) return convertirV3(src, niveau, habillage);
  const themes = habillage.themes;
  const phrases = Object.fromEntries(src.phrases.map((p) => [p.id, phrase(p)]));
  const conversations = Object.fromEntries(
    src.conversations.map((c) => [
      c.id,
      {
        titre: c.titre_fr,
        theme: c.theme,
        A: c.personnages.A,
        B: c.personnages.B,
        r: c.repliques.map((r) => ({ q: r.qui, ar: r.ar, fr: r.fr })),
        consigne: c.consigne_tuteur,
      },
    ]),
  );
  for (const x of [...Object.values(phrases), ...Object.values(conversations)])
    if (!themes[x.theme]) throw new Error(`thème sans habillage : ${x.theme}`);
  const parties = [];
  const etapes = [];
  const fins = new Map();
  for (const p of src.pages) {
    const type = TYPE[p.type];
    const pa = partie(p.partie);
    if (!type) continue; // guides et index : remplacés par l'introduction et les antisèches de l'application
    const refs = Array.isArray(p.refs) ? p.refs : [];
    for (const r of refs)
      if (!phrases[r] && !conversations[r]) throw new Error(`${p.id} : référence inconnue ${r}`);
    const page = { id: p.id, type, titre: p.titre_fr, refs };
    if (pa && !parties.some((x) => x.n === pa.n)) parties.push(pa);
    // fin de partie (révisions, situation libre, bilan) : étape à part ; grille finale : dernière étape
    const libre = type === 'tuteur' && refs.length > 1;
    if (!pa || type === 'revision' || type === 'bilan' || libre) {
      const n = pa?.n ?? 0;
      let f = fins.get(n);
      if (!f) {
        f = { id: n ? `fin${n}` : 'finale', partie: n, fin: true, n: p.apres_n, pages: [] };
        fins.set(n, f);
        etapes.push(f);
      }
      f.pages.push(page);
      continue;
    }
    let e = etapes.find((x) => !x.fin && x.partie === pa.n && x.n === p.apres_n);
    if (!e) {
      e = { id: `e${String(p.apres_n).padStart(2, '0')}`, partie: pa.n, n: p.apres_n, pages: [] };
      etapes.push(e);
    }
    e.pages.push(page);
  }
  // les étapes de fin se placent après la dernière étape de leur partie
  const ordre = (e) => (e.partie || 99) * 1000 + (e.fin ? 999 : e.n);
  etapes.sort((a, b) => ordre(a) - ordre(b));
  let num = 0;
  for (const e of etapes) {
    if (e.fin) {
      e.picto = 'etoile';
      continue;
    }
    e.num = ++num;
    const ph = e.pages.flatMap((p) => (p.type === 'cartes' ? p.refs : []));
    const cv = e.pages.flatMap((p) => (p.type === 'conversation' ? p.refs : []));
    // thème de l'étape : celui de sa conversation, sinon le plus fréquent de ses phrases
    const compte = {};
    for (const r of ph) compte[phrases[r].theme] = (compte[phrases[r].theme] ?? 0) + 1;
    e.theme = cv.length
      ? conversations[cv[0]].theme
      : Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0];
    const h = themes[e.theme];
    Object.assign(e, { titre: h.fr, picto: h.picto, accroche: h.accroche });
    // phrase du jour : la première de l'étape (sinon la première réplique)
    const pj = ph.length ? formes(phrases[ph[0]])[0] : conversations[cv[0]].r[0];
    e.jour = { ar: pj.ar, fr: pj.fr };
    // antisèche (8 à 16 lignes) : les phrases de l'étape, puis les répliques de ses conversations
    const lignes = [];
    const vu = new Set();
    const ajouter = (x) => {
      if (lignes.length < 16 && !vu.has(x.ar)) {
        vu.add(x.ar);
        lignes.push([x.ar, x.fr]);
      }
    };
    for (const r of ph) formes(phrases[r]).forEach(ajouter);
    for (const c of cv) conversations[c].r.forEach(ajouter);
    e.antiseche = lignes;
  }
  return {
    format: 1,
    niveau,
    titre: src.meta.titre,
    version: src.meta.version,
    genere: src.meta.genere_le,
    antiseche_ar: habillage.antiseche_ar,
    themes: Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, v.fr])),
    parties,
    etapes,
    phrases,
    conversations,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const niveaux = process.argv.slice(2).length ? process.argv.slice(2) : NIVEAUX_PARLER;
  const dir = join(repo, 'packages', 'content', 'data', 'cahier-parler');
  const habillage = JSON.parse(readFileSync(join(dir, 'themes.json'), 'utf8'));
  for (const n of niveaux) {
    const src = JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'));
    const out = join(root, 'static', 'cahier-data', `parler-${n}.json`);
    mkdirSync(dirname(out), { recursive: true });
    const c = convertir(src, n, habillage);
    writeFileSync(out, JSON.stringify(c) + '\n');
    console.log(`${n} : ${c.etapes.length} étapes → static/cahier-data/parler-${n}.json`);
  }
  const ts = [
    '/**',
    ' * Cahier « Je parle » (24/10/2026) — FICHIER GÉNÉRÉ par `node scripts/cahier-parler-donnees.mjs` : ne pas modifier',
    ' * à la main. Très petit (coquille de l’élève) : niveaux qui ont un cahier « Je parle » (accès du niveau).',
    ' */',
    // une ligne par niveau : même mise en forme que prettier (le fichier est contrôlé par `format:check`)
    `export const PARLER_NIVEAUX: readonly string[] = [\n${niveaux.map((n) => `  '${n}',`).join('\n')}\n];`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'src', 'lib', 'cahier-parler-niveaux.ts'), ts);
}
