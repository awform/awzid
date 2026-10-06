/**
 * A34 — Muṣḥaf de Médine « à l'identique » (édition 1405, polices « par page » QCF V1 du Complexe du Roi Fahd).
 *
 * Logique PURE, sans import (relue aussi par l'outil `infra/outils/qf-lignes`, Node avec effacement des types) :
 *  - forme des données de lignes (`ExactFile` / `ExactPage`), obtenues par la synchronisation « Content Sync » de
 *    Quran Foundation (jamais livrées dans le dépôt ni dans la construction : conditions QF § 2.4) ;
 *  - mots du texte TANZIL d'un verset (référence : recherche, copie, audio, lecteur d'écran) — les glyphes ne sont
 *    qu'une PRÉSENTATION de ce texte ;
 *  - lignes d'une page à afficher (15 lignes : texte, en-tête de sourate, basmala) ;
 *  - contrôle de cohérence BLOQUANT (604 pages, 15 lignes, chaque mot de chaque verset ↔ Tanzil 1:1, aucun
 *    verset manquant ni en double, glyphes présents dans la police de la page).
 * Le texte coranique n'est jamais transformé : on découpe aux espaces et on compare des NOMBRES de mots.
 */

export const EXACT_PAGES = 604;
export const EXACT_LINES = 15;
export const EXACT_FORMAT = 1;

/**
 * Mot positionné : [sourate, verset, position dans le verset, glyphe(s), type d'origine].
 * Position : 1..n = mot n du verset ; 0 = signe de fin de verset ; -1 = signe isolé (pause, ۩, ۞).
 */
export type ExactWord = [s: number, a: number, pos: number, code: string, type: string];
/** Ligne de TEXTE d'une page (numéro 1 à 15) et ses mots dans l'ordre de lecture. */
export interface ExactLine {
  n: number;
  w: ExactWord[];
}
export interface ExactPage {
  p: number;
  lines: ExactLine[];
}
export interface ExactSource {
  /** « Quran Foundation — Content Sync » */
  name: string;
  url: string;
  env: string;
  resource: string;
  mushafName: string;
  syncedAt: string;
}
export interface ExactFile {
  format: number;
  source: ExactSource | null;
  generatedAt: string | null;
  pages: ExactPage[];
}

/** Fichier de forme identique, VIDE : aucune donnée tant que la synchronisation n'a pas été lancée. */
export const EMPTY_EXACT_FILE: ExactFile = {
  format: EXACT_FORMAT,
  source: null,
  generatedAt: null,
  pages: [],
};

/** Ligne à afficher : texte, en-tête de sourate (police QCF_BSML) ou basmala (QCF_BSML). */
export type DisplayLine =
  | { n: number; kind: 'texte'; w: ExactWord[] }
  | { n: number; kind: 'sourate'; s: number }
  | { n: number; kind: 'basmala'; s: number }
  | { n: number; kind: 'vide' };

const BOM = '﻿';
const SHADDA = /ّ/g;
/** jeton fait SEULEMENT de signes (pause ۖ…ۜ, ۞ début de ḥizb, ۩ prosternation) : pas un mot */
const MARKS_ONLY = /^[ۖ-ۭ]+$/u;

/**
 * Mots d'un verset du texte Tanzil (tel quel) : découpe aux espaces, sans les signes isolés (pause, ۞, ۩), sans
 * la basmala que Tanzil place en tête du verset 1 des sourates 2 à 114 (sauf 9) — elle est dessinée à part dans le
 * muṣḥaf. `basmala` = texte de 1:1. Les mots rendus sont des sous-chaînes exactes du texte.
 */
export function tanzilWords(s: number, a: number, text: string, basmala: string): string[] {
  let words = text
    .replace(BOM, '')
    .split(' ')
    .filter((x) => x !== '' && !MARKS_ONLY.test(x));
  if (a === 1 && s !== 1 && s !== 9 && basmala) {
    const b = basmala.replace(BOM, '').split(' ');
    const head = words.slice(0, b.length).join(' ');
    if (words.length > b.length && head.replace(SHADDA, '') === b.join(' ').replace(SHADDA, ''))
      words = words.slice(b.length);
  }
  return words;
}

/** Sourate où commence chaque ligne vide d'en-tête : premier mot (verset 1, position 1) de la page. */
function suraStarts(page: ExactPage): { s: number; line: number }[] {
  const out: { s: number; line: number }[] = [];
  for (const l of page.lines)
    for (const w of l.w) if (w[1] === 1 && w[2] === 1) out.push({ s: w[0], line: l.n });
  return out;
}

/**
 * Lignes à afficher d'une page : les lignes de texte des données, et, juste avant le premier mot d'une sourate,
 * la basmala (sauf sourates 1 et 9) puis, au-dessus, l'en-tête de la sourate. Les lignes restantes sont « vides »
 * (ne doit jamais arriver sur une page complète : le contrôle le refuse).
 */
export function displayLines(page: ExactPage): DisplayLine[] {
  const byN = new Map<number, DisplayLine>();
  for (const l of page.lines) byN.set(l.n, { n: l.n, kind: 'texte', w: l.w });
  for (const { s, line } of suraStarts(page)) {
    let at = line - 1;
    if (s !== 1 && s !== 9) {
      if (at >= 1 && !byN.has(at)) byN.set(at, { n: at, kind: 'basmala', s });
      at--;
    }
    if (at >= 1 && !byN.has(at)) byN.set(at, { n: at, kind: 'sourate', s });
  }
  const used = [...byN.keys()];
  const last = page.p <= 2 ? Math.max(...used, 1) : EXACT_LINES;
  const first = page.p <= 2 ? Math.min(...used, 1) : 1;
  const out: DisplayLine[] = [];
  for (let n = first; n <= last; n++) out.push(byN.get(n) ?? { n, kind: 'vide' });
  return out;
}

/** Positions (ligne, rang) des glyphes du verset s:a sur la page — pour le surlignage du verset en cours. */
export function verseGlyphs(page: ExactPage, s: number, a: number): { n: number; i: number }[] {
  const out: { n: number; i: number }[] = [];
  for (const l of page.lines)
    l.w.forEach((w, i) => w[0] === s && w[1] === a && out.push({ n: l.n, i }));
  return out;
}

/** Versets présents sur la page, dans l'ordre (sans doublon). */
export function pageVerseKeys(page: ExactPage): [number, number][] {
  const out: [number, number][] = [];
  for (const l of page.lines)
    for (const w of l.w) {
      const last = out[out.length - 1];
      if (!last || last[0] !== w[0] || last[1] !== w[1]) out.push([w[0], w[1]]);
    }
  return out;
}

/**
 * Glyphes de la police QCF_BSML du Complexe (relevés le 06/10/2026 en dessinant tous ses points de code) :
 * basmala = U+FB51 U+FB52 U+FB53 ; mot « سورة » = U+FB8C ; noms des sourates 1 à 37 = U+FB8D…U+FBB1, puis
 * 38 à 114 = U+FBD3…U+FC1F (U+FBB2…U+FBD2 ne sont pas des caractères arabes : la police les saute).
 */
export const BSML_BASMALA = 'ﭑﭒﭓ';
export const BSML_SOURATE = 'ﮌ';
export function bsmlSuraName(s: number): string {
  if (s < 1 || s > 114) return '';
  return String.fromCodePoint(s <= 37 ? 0xfb8c + s : 0xfbd3 + (s - 38));
}

/** Nom du fichier de police (Complexe, servi tel quel) d'une page : QCF_P001.ttf … QCF_P604.ttf. */
export const pageFontFile = (p: number) => `QCF_P${String(p).padStart(3, '0')}.ttf`;
export const BSML_FONT_FILE = 'QCF_BSML.ttf';

export interface CheckInput {
  file: ExactFile;
  /** nombre de versets de chaque sourate (114) */
  lengths: readonly number[];
  /** texte Tanzil d'un verset (tel quel) */
  text: (s: number, a: number) => string | undefined;
  /** texte Tanzil de 1:1 (basmala) */
  basmala: string;
  /** débuts de page Tanzil (métadonnées, 604 × [sourate, verset]) — facultatif */
  pageStarts?: readonly (readonly [number, number])[];
  /** points de code présents dans la police de la page p — facultatif (contrôle des glyphes) */
  fontHas?: (p: number, cp: number) => boolean | null;
  /** contrôle partiel (échantillon) : seulement ces pages, sans exiger les 604 ni tous les versets */
  partial?: boolean;
}

/**
 * Contrôle de cohérence : liste des écarts (vide = conforme). BLOQUANT pour la synchronisation et le test.
 */
export function checkExactFile(inp: CheckInput): string[] {
  const { file, lengths, text, basmala } = inp;
  const err: string[] = [];
  const max = 50;
  const add = (m: string) => {
    if (err.length < max) err.push(m);
    else if (err.length === max) err.push('… (écarts suivants non listés)');
  };
  if (file.format !== EXACT_FORMAT) add(`format ${file.format} ≠ ${EXACT_FORMAT}`);
  if (lengths.length !== 114) add(`sourates : ${lengths.length} ≠ 114`);
  if (!inp.partial && file.pages.length !== EXACT_PAGES)
    add(`pages : ${file.pages.length} ≠ ${EXACT_PAGES}`);
  // mots relevés par verset, dans l'ordre de lecture (page, ligne, rang)
  const seen = new Map<string, { pos: number[]; ends: number }>();
  let prev: [number, number] = [0, 0];
  let prevPage = 0;
  for (const pg of file.pages) {
    if (pg.p !== prevPage + 1 && !inp.partial) add(`page ${pg.p} après la page ${prevPage}`);
    if (pg.p < 1 || pg.p > EXACT_PAGES) add(`numéro de page ${pg.p} hors limites`);
    prevPage = pg.p;
    const nums = pg.lines.map((l) => l.n);
    if (new Set(nums).size !== nums.length) add(`page ${pg.p} : numéro de ligne en double`);
    for (let k = 1; k < nums.length; k++)
      if (nums[k]! <= nums[k - 1]!) add(`page ${pg.p} : lignes dans le désordre`);
    for (const l of pg.lines) {
      if (l.n < 1 || l.n > EXACT_LINES)
        add(`page ${pg.p} : ligne ${l.n} hors de 1 à ${EXACT_LINES}`);
      if (l.w.length === 0) add(`page ${pg.p} ligne ${l.n} : aucun mot`);
      for (const w of l.w) {
        const [s, a, pos, code] = w;
        if (!(s >= 1 && s <= 114 && a >= 1 && a <= (lengths[s - 1] ?? 0))) {
          add(`page ${pg.p} ligne ${l.n} : verset inconnu ${s}:${a}`);
          continue;
        }
        if (s < prev[0] || (s === prev[0] && a < prev[1]))
          add(
            `page ${pg.p} ligne ${l.n} : ${s}:${a} après ${prev[0]}:${prev[1]} (ordre de lecture)`,
          );
        prev = [s, a];
        if (!code) add(`page ${pg.p} : glyphe vide pour ${s}:${a} mot ${pos}`);
        else if (inp.fontHas)
          for (const ch of code) {
            const ok = inp.fontHas(pg.p, ch.codePointAt(0)!);
            if (ok === false)
              add(
                `page ${pg.p} : glyphe U+${ch.codePointAt(0)!.toString(16).toUpperCase()} (${s}:${a} mot ${pos}) absent de ${pageFontFile(pg.p)}`,
              );
          }
        const k = `${s}:${a}`;
        const v = seen.get(k) ?? { pos: [], ends: 0 };
        // pos < 0 : signe isolé (pause, prosternation, ḥizb) — dessiné, mais pas un mot de Tanzil
        if (pos === 0) v.ends++;
        else if (pos > 0 && v.ends > 0) add(`${k} : mot ${pos} après le signe de fin de verset`);
        else if (pos > 0) v.pos.push(pos);
        seen.set(k, v);
      }
    }
    // 15 lignes occupées (texte + en-têtes + basmala), sauf pages 1 et 2
    const disp = displayLines(pg);
    if (pg.p > 2) {
      const vides = disp.filter((d) => d.kind === 'vide').map((d) => d.n);
      if (vides.length) add(`page ${pg.p} : lignes sans contenu ${vides.join(', ')}`);
    }
    for (const { s, line } of suraStarts(pg)) {
      const need = s === 1 || s === 9 ? 1 : 2;
      if (line - need < 1)
        add(`page ${pg.p} : en-tête de la sourate ${s} hors de la page (ligne ${line})`);
    }
    if (inp.pageStarts) {
      const st = inp.pageStarts[pg.p - 1];
      const first = pg.lines[0]?.w[0];
      if (st && first && (first[0] !== st[0] || first[1] !== st[1]))
        add(`page ${pg.p} : commence à ${first[0]}:${first[1]}, Tanzil ${st[0]}:${st[1]}`);
    }
  }
  // chaque verset : mots 1..n dans l'ordre, n = nombre de mots Tanzil, un seul signe de fin
  for (let s = 1; s <= lengths.length; s++)
    for (let a = 1; a <= (lengths[s - 1] ?? 0); a++) {
      const k = `${s}:${a}`;
      const v = seen.get(k);
      if (!v) {
        if (!inp.partial) add(`${k} : verset manquant`);
        continue;
      }
      const t = text(s, a);
      if (t === undefined) {
        add(`${k} : texte Tanzil absent`);
        continue;
      }
      const n = tanzilWords(s, a, t, basmala).length;
      if (v.ends !== 1) add(`${k} : ${v.ends} signe(s) de fin de verset (attendu : 1)`);
      if (v.pos.length !== n)
        add(`${k} : ${v.pos.length} mot(s) dans les données, ${n} dans Tanzil`);
      else if (v.pos.some((p, i) => p !== i + 1)) add(`${k} : mots en double ou dans le désordre`);
    }
  return err;
}
