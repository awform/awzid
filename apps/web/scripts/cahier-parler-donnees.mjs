// Cahier « Je parle » (24/10/2026) — données de l'APPLICATION tirées de la source unique du cahier
// (packages/content/data/cahier-parler/<niveau>.json, générée par application/design/cahier_parler_ad2/donnees/etape2_cahier.ps1,
// copie exacte) et de l'habillage des étapes (packages/content/data/cahier-parler/themes.json : thème, pictogramme d'objet,
// accroche) :
//  - static/cahier-data/parler-<niveau>.json : étapes (une par leçon du livre, puis la fin de chaque partie), pages,
//    phrases, conversations et antisèches ; chargé à la demande par le cahier (jamais préchargé : `/cahier-data/` est hors
//    de la coquille du service worker) et gardé sur l'appareil à la première ouverture ;
//  - src/lib/cahier-parler-niveaux.ts : niveaux qui ont un cahier « Je parle » (accès du niveau).
// L'arabe est recopié TEL QUEL (aucune normalisation) : contrôle par src/lib/cahier-parler/parler.test.ts.
// Usage : node scripts/cahier-parler-donnees.mjs [niveau…] (défaut : ad2).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
export const NIVEAUX_PARLER = ['ad2'];
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

export function convertir(src, niveau, habillage) {
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
    `export const PARLER_NIVEAUX: readonly string[] = ${JSON.stringify(niveaux).replace(/"/g, "'")};`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'src', 'lib', 'cahier-parler-niveaux.ts'), ts);
}
