// Cahier de lecture (20/10/2026) — données de l'APPLICATION tirées de la source unique du cahier
// (packages/content/data/cahier/<niveau>.json, générée par application/design/cahier_lecture_<niveau>/donnees/etape2_cahier.ps1 :
// la même source sert au livre imprimé, à l'application et aux vidéos vivantes).
//  - static/cahier-data/<niveau>.json : pages allégées (ni sources ni comptes d'impression), chargées à la demande par le
//    cahier (jamais préchargées) et gardées sur l'appareil au téléchargement du niveau ;
//  - src/lib/cahier-pages.ts : niveaux qui ont un cahier et pages du parcours par leçon (lien « page du jour »).
// 25/10/2026 : cahiers des enfants (en1) et des ados (ado1). Leurs jeux papier de fin de grille (colorie, relie, atelier,
// défi chrono, duel…) sont REMPLACÉS dans l'application par les jeux interactifs (`page.jeu`, scripts/cahier-jeux.mjs) ; une
// grille se débloque case par case dès que ses lettres et ses signes sont enseignés (`n` : numéro de la leçon).
// L'arabe est recopié TEL QUEL (aucune normalisation, chadda puis voyelle comme dans la source) : contrôle par
// src/lib/cahier/cahier.test.ts. Usage : node scripts/cahier-donnees.mjs [niveau…] (défaut : ad1 en1 ado1).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contexteJeux, jeuxDePage, nDe } from './cahier-jeux.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
export const NIVEAUX_CAHIER = ['ad1', 'en1', 'ado1'];
/** niveaux dont la grille se débloque case par case et qui ont des jeux interactifs (enfants, ados) */
export const NIVEAUX_JEUX = ['en1', 'ado1'];
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
    case 'jeu_colorie':
    case 'jeu_chasse':
      // « je colorie », « je trouve la lettre » : on touche les cases de la lettre (aucun texte arabe nouveau)
      o.consigne = b.elements[0]?.consigne_fr;
      o.el = b.elements.map((r) => ({
        lettre: r.lettre,
        consigne: r.consigne_fr,
        a: KIND[r.audio ?? 'tts_syllabe'],
        cases: r.cases.map((c) => ({ ar: c.ar, cible: !!c.cible })),
      }));
      break;
    default:
      o.el = b.elements.map(el);
  }
  return o;
}

/** leçon d'enseignement (numéro de fichier) → libellé du livre (« Leçon 3 »), d'après la concordance de la source */
function libelles(src) {
  const out = {};
  for (const c of src.concordance ?? []) {
    const m = /^l(\d+)$/.exec(c.apres);
    if (m) out[Number(m[1])] = c.lecon;
  }
  return out;
}

function page(p, ctx, lib) {
  const o = {
    id: p.id,
    num: p.num,
    titre: p.titre_fr,
    partie: p.partie,
    type: p.type,
    apres: p.apres,
    n: p.apres_n,
    lecon: 'lecon_ad1' in p ? p.lecon_ad1 : (p.lecon ?? null),
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
  if (p.defi) {
    o.defi = { max: p.defi.score_max };
    if (p.defi.paliers) o.defi.paliers = p.defi.paliers;
  }
  if (p.texte_renvoi) o.renvoi = p.texte_renvoi;
  // jeux papier de fin de grille : remplacés par les jeux interactifs (`jeu`) ; « je relie » : mots de la page (les
  // images d'objets du livre imprimé ne sont pas dans l'application)
  o.blocs = (p.blocs ?? [])
    .filter((b) => !['jeu_grille', 'jeu_ado'].includes(b.type))
    .map((b) =>
      b.type === 'jeu_relie'
        ? {
            type: 'mots',
            titre: b.titre_fr,
            el: b.elements.flatMap((r) =>
              r.mots.map((m) => ({ ar: m.ar, a: 't', ...(m.c?.length ? { c: m.c } : {}) })),
            ),
          }
        : bloc(b),
    );
  if (p.texte) {
    const a = KIND[p.texte.audio ?? 'tts'];
    o.texte = { lignes: p.texte.lignes, nb: p.texte.nb_mots, a };
    if (p.texte.titre_ar) o.texte.titre = p.texte.titre_ar;
  }
  // grilles des cahiers des enfants et des ados : déblocage case par case, jeux de fin de grille
  if (ctx && p.type === 'grille') {
    const repli = p.apres_n;
    const g = o.blocs.find((b) => b.type === 'grille');
    for (const r of g.el) for (const e of r.el) e.n = nDe(e.ar, ctx, repli);
    const lm = o.blocs.find((b) => b.type === 'ligne_mots');
    for (const e of lm?.el ?? []) e.n = nDe(e.ar, ctx, repli);
    // la page s'ouvre dès sa première case (la lettre et sa première voyelle enseignées)
    const premier = Math.min(...g.el.flatMap((r) => r.el.map((e) => e.n)));
    if (Number.isFinite(premier) && premier < o.n) {
      o.n = premier;
      o.apres = `l${String(premier).padStart(2, '0')}`;
      o.lecon = lib[premier] ?? o.lecon;
    }
    const jeu = jeuxDePage(p, ctx, repli);
    if (jeu) {
      o.jeu = jeu;
      o.blocs.push({ type: 'jeux', titre: 'Jeu de la lettre', el: [] });
    }
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

export function convertir(src, niveau, garde = [], audio = null) {
  const reciter = recitation(src, garde);
  const jeux = NIVEAUX_JEUX.includes(niveau) && audio;
  const ctx = jeux ? contexteJeux(src, niveau, audio) : null;
  const lib = libelles(src);
  const pages = src.pages.map((p) => page(p, ctx, lib));
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
    ...(jeux ? { lecons: lib } : {}),
    pages,
  };
}

/** pages du parcours (hors rattrapage) par unité du livre (`ad1.l01`), d'après les pages CONVERTIES (déblocage des grilles) */
export function concordance(cahier, niveau) {
  const out = {};
  for (const p of cahier.pages) {
    if (p.hors) continue;
    (out[`${niveau}.${p.apres}`] ??= []).push(p.num);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const niveaux = process.argv.slice(2).length ? process.argv.slice(2) : NIVEAUX_CAHIER;
  const unites = {};
  for (const n of niveaux) {
    const dir = join(repo, 'packages', 'content', 'data', 'cahier');
    const src = JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'));
    const audio = JSON.parse(readFileSync(join(dir, `${n}.audio.json`), 'utf8'));
    const out = join(root, 'static', 'cahier-data', `${n}.json`);
    mkdirSync(dirname(out), { recursive: true });
    const cahier = convertir(src, n, audio.garde_coran ?? [], audio);
    writeFileSync(out, JSON.stringify(cahier) + '\n');
    unites[n] = Object.keys(concordance(cahier, n)).filter((u) => !/\.l00$/.test(u));
    console.log(`${n} : ${src.pages.length} pages → static/cahier-data/${n}.json`);
  }
  // unités SANS page, avant la dernière leçon qui en a une (le moins d'octets possible dans la coquille de l'élève) :
  // les livres n'ont pas d'unité au-delà de leur dernière page de cahier (ad1 : l25, en1 : l26, ado1 : l25)
  const sansPage = Object.entries(unites).flatMap(([n, liste]) => {
    const nums = liste.map((u) => Number(/\.l(\d+)$/.exec(u)[1]));
    const max = Math.max(...nums);
    return Array.from({ length: max }, (_, i) => i + 1)
      .filter((k) => !nums.includes(k))
      .map((k) => `${n}.l${String(k).padStart(2, '0')}`);
  });
  const ts = [
    '/**',
    ' * Cahier de lecture (20/10/2026) — FICHIER GÉNÉRÉ par `node scripts/cahier-donnees.mjs` depuis',
    ' * packages/content/data/cahier/<niveau>.json : ne pas modifier à la main. Très petit (coquille de l’élève) : niveaux',
    ' * qui ont un cahier et unités du livre qui n’ont pas de page (lien « page du jour » de la leçon ; la page elle-même',
    ' * est choisie par le cahier, chargé à la demande).',
    ' */',
    `export const CAHIER_NIVEAUX: readonly string[] = ${JSON.stringify(niveaux)};`,
    '/** unités du livre (`ad1.l23`) qui n’ont pas de page de cahier (les autres unités de ces niveaux en ont) */',
    `export const CAHIER_SANS_PAGE: readonly string[] = ${JSON.stringify(sansPage)};`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'src', 'lib', 'cahier-pages.ts'), ts);
}
