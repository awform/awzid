// Cahier de lecture (20/10/2026) — données de l'APPLICATION tirées de la source unique du cahier
// (packages/content/data/cahier/<niveau>.json, générée par application/design/cahier_lecture_ad1/donnees/etape2_cahier.ps1 :
// la même source sert au livre imprimé, à l'application et aux vidéos vivantes).
//  - static/cahier-data/<niveau>.json : pages allégées (ni sources ni comptes d'impression), chargées à la demande par le
//    cahier (jamais préchargées) et gardées sur l'appareil au téléchargement du niveau ;
//  - src/lib/cahier-pages.ts : niveaux qui ont un cahier et pages du parcours par leçon (lien « page du jour »).
// L'arabe est recopié TEL QUEL (aucune normalisation, chadda puis voyelle comme dans la source) : contrôle par
// src/lib/cahier/cahier.test.ts. Usage : node scripts/cahier-donnees.mjs [niveau…] (défaut : ad1).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
export const NIVEAUX_CAHIER = ['ad1'];
const KIND = { tts_syllabe: 's', tts: 't', tts_controle: 'k', recitation: 'q' };

/** élément lu : texte arabe, nature de l'audio (s syllabe, t mot ou phrase, k contrôle renforcé, q récitation), couleur */
function el(e) {
  const o = { ar: e.ar, a: KIND[e.audio] };
  if (!o.a) throw new Error(`audio inconnu : ${e.audio} (${e.ar})`);
  if (e.c?.length) o.c = e.c;
  if (e.diff) o.d = e.diff;
  if (e.rattrapage) o.r = e.rattrapage;
  if (e.src?.type === 'coran' && o.a === 'q') o.ref = e.src.ref;
  if (e.sep) o.sep = e.sep;
  return o;
}
function bloc(b) {
  const o = { type: b.type, titre: b.titre_fr };
  if (b.note_fr) o.note = b.note_fr;
  switch (b.type) {
    case 'grille':
      o.el = b.elements.map((r) => ({
        titre: r.titre_fr,
        ...(r.note_fr ? { note: r.note_fr } : {}),
        el: r.cellules.map(el),
      }));
      break;
    case 'table':
    case 'formes':
      o.el = b.elements.map((r) => ({
        lettre: r.lettre,
        ...(r.lecon ? { lecon: r.lecon } : {}),
        el: r.cellules.map(el),
      }));
      break;
    case 'paires':
      o.el = b.elements.map((p) => ({ p: [el(p.a), el(p.b)] }));
      break;
    case 'alphabet':
      o.el = b.elements.map((e) => ({ ...el(e), lecon: e.lecon }));
      break;
    case 'atelier_mot':
      o.consigne = b.consigne_fr;
      o.el = b.elements.map((m) => ({
        lettres: m.lettres,
        cases: m.cases.map((c) => ({ lettre: c.lettre, signe: c.signe, choix: !!c.a_choisir })),
        squelette: m.squelette,
        solution: m.solution,
        syllabes: m.syllabes,
      }));
      break;
    case 'sourate':
      if (b.basmala_ar) o.basmala = b.basmala_ar;
      o.el = b.elements.map((v) => ({ ar: v.ar, a: 'q', ref: v.ref }));
      break;
    default:
      o.el = b.elements.map(el);
  }
  return o;
}
function page(p) {
  const o = {
    id: p.id,
    num: p.num,
    titre: p.titre_fr,
    partie: p.partie,
    type: p.type,
    apres: p.apres,
    n: p.apres_n,
    lecon: p.lecon_ad1,
    consigne: p.consigne_fr,
    cases: p.cases,
  };
  if (p.hors_parcours) o.hors = true;
  if (p.texte_fr?.length) o.guide = p.texte_fr;
  if (p.notes_fr?.length) o.notes = p.notes_fr;
  if (p.critere)
    o.critere = {
      reussite: p.critere.reussite,
      seuil: p.critere.seuil_mots,
      echec: p.critere.en_cas_echec,
    };
  if (p.seuil)
    o.seuil = { unite: p.seuil.unite, minimum: p.seuil.minimum, objectif: p.seuil.objectif };
  if (p.texte_renvoi) o.renvoi = p.texte_renvoi;
  o.blocs = (p.blocs ?? []).map(bloc);
  if (p.texte) {
    const a = KIND[p.texte.audio ?? 'tts'];
    o.texte = { lignes: p.texte.lignes, nb: p.texte.nb_mots, a };
    if (p.texte.titre_ar) o.texte.titre = p.texte.titre_ar;
  }
  return o;
}

/** éléments lus d'une page convertie (cases de grilles et de tableaux, paires, mots…) */
function tousEls(p) {
  const out = [];
  for (const b of p.blocs)
    for (const x of b.el) {
      if (Array.isArray(x.el)) out.push(...x.el);
      else if (Array.isArray(x.p)) out.push(...x.p);
      else if (typeof x.ar === 'string' && x.a) out.push(x);
    }
  return out;
}

/** squelette de comparaison (lettres seules, alif waṣla lu comme alif) : aucune lettre arabe n'est écrite ici */
const squelette = (s) =>
  String(s)
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/ٱ/g, 'ا')
    .replace(/[^ء-ي]/g, '');

/**
 * Garde coranique du générateur (`garde_coran` de la liste audio du cahier) : un texte qui cite le Coran (4 mots ou plus)
 * n'a JAMAIS de voix de synthèse ; s'il est la Basmala (verset 1:1, texte du cahier lui-même), il est récité par
 * Muḥammad Ayyūb ; sinon il reste sans son.
 */
function recitation(src, garde) {
  const g = new Set(garde.map(squelette));
  const basmala = src.pages
    .flatMap((p) => p.blocs ?? [])
    .flatMap((b) => (b.type === 'sourate' ? b.elements : []))
    .find((v) => v.ref === '1:1');
  const s11 = basmala ? squelette(basmala.ar) : null;
  return (ar) => {
    const s = squelette(ar);
    if (!g.has(s)) return undefined;
    return { a: 'q', ...(s === s11 ? { ref: '1:1' } : {}) };
  };
}

export function convertir(src, niveau, garde = []) {
  const reciter = recitation(src, garde);
  const pages = src.pages.map(page);
  for (const p of pages) {
    for (const e of tousEls(p)) {
      const r = reciter(e.ar);
      if (r) Object.assign(e, r);
    }
    if (p.texte)
      p.texte.lignes.forEach((l, i) => {
        const r = reciter(l);
        if (r) (p.texte.recite ??= {})[i] = r.ref ?? '';
      });
  }
  return {
    format: 1,
    niveau,
    titre: src.meta.titre,
    version: src.meta.version,
    genere: src.meta.genere_le,
    rattrapage: src.rattrapage,
    pages,
  };
}

/** pages du parcours (hors rattrapage) par unité du livre (`ad1.l01`) */
export function concordance(src, niveau) {
  const out = {};
  for (const p of src.pages) {
    if (p.hors_parcours) continue;
    (out[`${niveau}.${p.apres}`] ??= []).push(p.num);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const niveaux = process.argv.slice(2).length ? process.argv.slice(2) : NIVEAUX_CAHIER;
  const pages = {};
  for (const n of niveaux) {
    const dir = join(repo, 'packages', 'content', 'data', 'cahier');
    const src = JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'));
    const audio = JSON.parse(readFileSync(join(dir, `${n}.audio.json`), 'utf8'));
    const out = join(root, 'static', 'cahier-data', `${n}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(convertir(src, n, audio.garde_coran ?? [])) + '\n');
    Object.assign(pages, concordance(src, n));
    console.log(`${n} : ${src.pages.length} pages → static/cahier-data/${n}.json`);
  }
  const ts = [
    '/**',
    ' * Cahier de lecture (20/10/2026) — FICHIER GÉNÉRÉ par `node scripts/cahier-donnees.mjs` depuis',
    ' * packages/content/data/cahier/<niveau>.json : ne pas modifier à la main. Très petit (coquille de l’élève) : niveaux',
    ' * qui ont un cahier et unités du livre qui ont des pages (lien « page du jour » de la leçon ; la page elle-même est',
    ' * choisie par le cahier, chargé à la demande).',
    ' */',
    `export const CAHIER_NIVEAUX: readonly string[] = ${JSON.stringify(niveaux)};`,
    `export const CAHIER_UNITES: readonly string[] = ${JSON.stringify(Object.keys(pages).filter((u) => !/\.l00$/.test(u)))};`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'src', 'lib', 'cahier-pages.ts'), ts);
}
