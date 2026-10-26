/* eslint-disable -- outil d'exploitation (inventaire audio global du 26/10/2026), pas du code de l'application */
import { readFileSync } from 'node:fs';
const P = '/home/awzid/awform-demo/packages/content/dist/';
const A = await import(P + 'audio-cle.js');
const G = await import(P + 'garde-coran.js');
const D = await import(P + 'dhikr.js');
export const C = await import(P + 'index.js');
export const { audioFileId, audioKey, skeleton, looksQuranic } = A;
export const HOME = '/home/awzid/';

// ---- Tanzil (ordre du Muṣḥaf)
export const tanzil = new Map();
for (const l of readFileSync(HOME + 'awform-content/coran/tanzil-uthmani.tsv', 'utf8').split(
  '\n',
)) {
  const i = l.indexOf('\t');
  if (i > 0) tanzil.set(l.slice(0, i), l.slice(i + 1));
}
export const refsTriees = [...tanzil.keys()].sort((a, b) => {
  const [s1, v1] = a.split(':').map(Number),
    [s2, v2] = b.split(':').map(Number);
  return s1 - s2 || v1 - v2;
});
export const verses = refsTriees.map((r) => tanzil.get(r));
export const g = G.gardeCoran(verses);
export const { refusVoix, estHadith, contientVerset, basmalaRecitee, autorise } = G;
const BAS = G.BASMALA_COMPLETE;

// squelette de chaque verset (sans la Basmala de tête) -> ref
const skV = refsTriees.map((r) => {
  let k = A.skeleton(tanzil.get(r));
  if (k.startsWith(BAS + ' ')) k = k.slice(BAS.length + 1);
  return k;
});
const skRef = new Map();
skV.forEach((k, i) => {
  if (!skRef.has(k)) skRef.set(k, refsTriees[i]);
});

/** références de verset contenant le texte (squelette) : sous-chaîne d'un verset ou de deux versets consécutifs */
export function refsDe(texte) {
  const k = A.skeleton(texte.replace(/[[\]]/g, ''));
  if (!k) return '';
  if (skRef.has(k)) return skRef.get(k);
  const out = [];
  for (let i = 0; i < skV.length && out.length < 3; i++) {
    if ((' ' + skV[i] + ' ').includes(' ' + k + ' ')) out.push(refsTriees[i]);
    else if (i + 1 < skV.length && (' ' + skV[i] + ' ' + skV[i + 1] + ' ').includes(' ' + k + ' '))
      out.push(refsTriees[i] + '+');
  }
  return out.join(',');
}

// ---- index audio : sha -> Set(niveaux)
export const index = new Map();
for (const l of readFileSync(HOME + 'lecons-audio/liste.csv', 'utf8')
  .split('\n')
  .slice(1)) {
  const c = l.split(';');
  if (c.length < 6) continue;
  index.set(c[0].replace(/^﻿/, ''), new Set((c[5] || '').split(' ').filter(Boolean)));
}
export const aFichier = (texte, niveaux) => {
  const id = audioFileId(texte);
  if (!id) return false;
  const s = index.get(id);
  if (!s) return false;
  return (Array.isArray(niveaux) ? niveaux : [niveaux]).some((n) => s.has(n));
};
export const aFichierAilleurs = (texte) => {
  const id = audioFileId(texte);
  return !!id && index.has(id);
};

// ---- déjà en cours de génération
const DATA = HOME + 'awform-demo/packages/content/data/zero-muet/';
export const enCours = new Set();
for (const f of ['a-generer-synthese-v2.tsv', 'a-generer-synthese.tsv'])
  for (const l of readFileSync(DATA + f, 'utf8')
    .split('\n')
    .slice(1)) {
    const t = f.includes('v2') ? l.split('\t')[5] : l.split('\t')[0];
    if (t) enCours.add(audioFileId(t));
  }

// ---- natures
const AR = /[ء-ي]/;
export const estArabe = (s) => AR.test(s);
const skT = (s) => A.skeleton(s.replace(/[[\]]/g, ''));
const hasBasmalaComplete = (s) => (' ' + skT(s) + ' ').includes(' ' + BAS + ' ');
const seulementBasmala = (s) => skT(s) === BAS;
const hadithMarque = (s) => /ﷺ/.test(s) || /(^| )(ورهم?|وروه)( |$)/.test(A.skeleton(s));
const toutDhikr = (s) => {
  try {
    return D.horsDhikr(s).every((x) => !AR.test(x));
  } catch {
    return false;
  }
};

/**
 * nature: a Coran | b Basmala comme Coran | c hadith/athar | d dhikr/doua | e arabe de leçon | m mixte (hadith + verset)
 * ctx : { coran:true (affiché comme Coran), hadith:true, dhikr:true }
 */
const REFV = /[0-9٠-٩]{1,3}\s*:\s*[0-9٠-٩]{1,3}/;
const ANN = new Set(['تعلي', 'وتعلي', 'قر', 'وقر', 'تل', 'فتل', 'سوره', 'يه']);
const annonceVerset = (t) =>
  A.skeleton(t.replace(/[[\]]/g, ''))
    .split(' ')
    .some((w) => ANN.has(w)) ||
  REFV.test(t) ||
  /[﴾﴿]/.test(t);
export function classer(texte, ctx = {}) {
  const t = texte;
  if (ctx.coran) return seulementBasmala(t) ? 'b' : 'a';
  const r = refusVoix(t, g);
  const base = ctx.dhikr ? 'd' : 'c';
  if (r) {
    if (seulementBasmala(t)) return 'b';
    const hl = ctx.hadith || hadithMarque(t);
    if (hl) {
      const cv = contientVerset(t, g);
      // hadith qui ne cite qu'une partie de verset, sans l'annoncer ni le référencer : synthèse permise
      if (!cv && !annonceVerset(t) && r === 'citation') return base;
      const sc = scinder(t);
      if (sc.versets.length && !sc.reste.length) return 'a';
      return 'm';
    }
    return 'a';
  }
  if (ctx.hadith && ctx.dhikr) return 'd';
  if (ctx.dhikr) return 'd';
  if (ctx.hadith || estHadith(t) || hadithMarque(t)) return 'c';
  if (toutDhikr(t) || /(^| )بسم الله( |$)/.test(A.skeleton(t))) return 'd';
  return 'e';
}

/** précision pour la nature « a » (aide le tri) */
export function precision(texte) {
  const k = A.skeleton(texte.replace(/[[\]]/g, ''));
  const n = k ? k.split(' ').length : 0;
  if (REFV.test(texte) || /[﴾﴿]/.test(texte)) return 'reference-ou-ornements';
  if (g.versets.has(k)) return 'verset-entier';
  if (contientVerset(texte, g)) return 'contient-verset';
  if (looksQuranic(texte) && n < 4) return 'graphie-muhsaf-moins-de-4-mots';
  if (looksQuranic(texte)) return 'graphie-muhsaf';
  return n >= 4 ? 'citation-4-mots' : 'moins-de-4-mots';
}

/** découpe un texte mixte : segments « verset » (≥3 mots = verset entier) et le reste (hadith) */
export function scinder(texte) {
  const toks = texte.split(/\s+/).filter(Boolean);
  const sk = toks.map((w) => A.skeleton(w));
  const n = toks.length;
  const verset = new Array(n).fill(false);
  // suites de 4 mots du Coran (citation partielle), hors formules de dhikr
  const idxMots = sk.map((w, i) => [w, i]).filter(([w]) => w);
  for (let a = 0; a + 4 <= idxMots.length; a++) {
    const win = idxMots.slice(a, a + 4);
    if (G.citeCoran(win.map(([, i]) => toks[i]).join(' '), g))
      for (const [, i] of win) verset[i] = true;
  }
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let j = Math.min(n, i + 130); j > i + 2; j--) {
      const k = sk.slice(i, j).filter(Boolean).join(' ');
      if (k && g.versets.has(k)) {
        best = j;
        break;
      }
    }
    if (best) {
      for (let x = i; x < best; x++) verset[x] = true;
      i = best - 1;
    }
  }
  const seg = (flag) => {
    const out = [];
    let cur = [];
    for (let i = 0; i < n; i++) {
      if (verset[i] === flag) cur.push(toks[i]);
      else if (cur.length) {
        out.push(cur.join(' '));
        cur = [];
      }
    }
    if (cur.length) out.push(cur.join(' '));
    return out;
  };
  return { versets: seg(true), reste: seg(false).filter((x) => AR.test(x)) };
}

export const rows = [];
export const anomalies = [];
export function vocalise(t) {
  const lettres = (t.match(/[ء-ي]/g) || []).length;
  const marques = (t.match(/[ً-ْٰ]/g) || []).length;
  return lettres <= 3 || t.trim().split(/\s+/).length <= 2 || marques / lettres >= 0.3;
}
const vus = new Set();
export const S = {};
export function stats(surface, niveau) {
  const k = surface + '|' + niveau;
  return (S[k] ??= { surface, niveau, total: 0, ok: 0 });
}
/** enregistre un texte arabe (une fois par surface+niveau+clé) */
export function noter(o) {
  const { surface, niveau, id, texte, niveaux, ctx } = o;
  if (!texte || !estArabe(texte)) return;
  const key = audioKey(texte);
  if (!key || !AR.test(key)) return;
  const k = surface + '|' + niveau + '|' + key;
  if (vus.has(k)) return;
  vus.add(k);
  const st = stats(surface, niveau);
  st.total++;
  const ok = o.audio !== undefined ? o.audio : aFichier(texte, niveaux ?? niveau);
  if (ok) {
    st.ok++;
    // anomalie : un fichier de synthèse existe sur un texte à réciter par Ayyūb (hors Prière déjà récitée)
    if (o.audio === undefined && o.nature === undefined) {
      const n = classer(texte, ctx ?? {});
      if (n === 'a' || n === 'b' || n === 'm')
        anomalies.push({ surface, niveau, id, texte, nature: n, sha: audioFileId(texte) });
    }
    return;
  }
  const nature = o.nature ?? classer(texte, ctx ?? {});
  const coranique = nature === 'a' || nature === 'b' || nature === 'm';
  let sc = null;
  if (nature === 'm' || nature === 'a') sc = scinder(texte);
  rows.push({
    surface,
    niveau,
    id,
    texte,
    nature,
    sha: audioFileId(texte),
    refs: coranique
      ? refsDe(texte) ||
        (sc && sc.versets.length
          ? sc.versets
              .map((x) => refsDe(x))
              .filter(Boolean)
              .join(',')
          : '')
      : '',
    precision: nature === 'a' ? precision(texte) : '',
    partieCoran: sc && sc.versets.length && sc.reste.length ? sc.versets.join(' | ') : '',
    partieSynthese: sc && sc.versets.length && sc.reste.length ? sc.reste.join(' | ') : '',
    cours: enCours.has(audioFileId(texte)),
    ailleurs: aFichierAilleurs(texte),
    voc: vocalise(texte),
    note: o.note ?? '',
    cible: niveaux ? [].concat(niveaux).join(' ') : niveau,
  });
}
