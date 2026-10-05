/**
 * Muṣḥaf par page (style Ayat, ergonomie seulement) — logique pure : pages du Muṣḥaf de Médine (débuts de
 * page des métadonnées Tanzil, CC BY 3.0), double page « livre », juzʾ d'une page, recherche de références,
 * réglages gardés sur l'appareil. Le texte coranique n'est jamais transformé ici : on ne manipule que des
 * références (sourate, verset) ; la recherche compare une forme SANS signes calculée à part, jamais affichée.
 */
import type { QuranMeta } from '@awform/hifz';

export type Ref = readonly [number, number];
/**
 * Affichage du muṣḥaf Ḥafṣ : sans ou avec tajwid en couleurs. Les autres riwāyāt (A8 : Warsh, Qālūn, Shuʿba,
 * as-Sūsī, ad-Dūrī, al-Bazzī) se choisissent à part (`riwayat.ts`, réglage commun aux onglets) ; un ancien
 * réglage « warsh » (désactivé avant A8) est relu comme « hafs ».
 */
export type MushafKind = 'hafs' | 'hafs-tajwid';
export const MUSHAF_KINDS: readonly { id: MushafKind; available: boolean }[] = [
  { id: 'hafs', available: true },
  { id: 'hafs-tajwid', available: true },
];
export const PAGE_COUNT = 604;

export interface PageSegment {
  s: number;
  from: number;
  to: number;
}

/** Nombre de versets de chaque sourate (d'après les poids des métadonnées). */
export const suraLengths = (meta: Pick<QuranMeta, 'weights'>) => meta.weights.map((w) => w.length);

/** Débuts des 604 pages ([sourate, verset]) — null si les métadonnées n'ont pas les pages réelles. */
export function pageStarts(meta: Pick<QuranMeta, 'divisions'>): readonly Ref[] | null {
  const p = meta.divisions?.pages;
  return p && p.length === PAGE_COUNT ? p : null;
}

const cmp = (x: Ref, y: Ref) => x[0] - y[0] || x[1] - y[1];

/** Page (1 à 604) qui contient le verset s:a. */
export function pageOf(starts: readonly Ref[], s: number, a: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cmp(starts[mid]!, [s, a]) <= 0) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Morceaux (une sourate chacun) de la page p, du premier au dernier verset de la page. */
export function pageSegments(
  starts: readonly Ref[],
  lengths: readonly number[],
  p: number,
): PageSegment[] {
  const st = starts[p - 1];
  if (!st) return [];
  const next = starts[p];
  // dernier verset de la page : juste avant le début de la page suivante (ou fin du Coran)
  let end: Ref;
  if (!next) end = [lengths.length, lengths[lengths.length - 1] ?? 1];
  else if (next[1] > 1) end = [next[0], next[1] - 1];
  else end = [next[0] - 1, lengths[next[0] - 2] ?? 1];
  const out: PageSegment[] = [];
  for (let s = st[0]; s <= end[0]; s++) {
    out.push({
      s,
      from: s === st[0] ? st[1] : 1,
      to: s === end[0] ? end[1] : (lengths[s - 1] ?? 1),
    });
  }
  return out;
}

/** Références de tous les versets de la page, dans l'ordre. */
export function pageVerses(starts: readonly Ref[], lengths: readonly number[], p: number): Ref[] {
  return pageSegments(starts, lengths, p).flatMap((g) =>
    Array.from({ length: g.to - g.from + 1 }, (_, i) => [g.s, g.from + i] as const),
  );
}

/** Juzʾ (1 à 30) dans lequel commence la page. */
export function juzOfPage(meta: Pick<QuranMeta, 'divisions'>, p: number): number {
  const starts = pageStarts(meta);
  const juz = meta.divisions?.juz;
  if (!starts || !juz) return 1;
  const st = starts[p - 1]!;
  let j = 1;
  for (let i = 0; i < juz.length; i++) if (cmp(juz[i]!, st) <= 0) j = i + 1;
  return j;
}

/** Page où commence un juzʾ. */
export function pageOfJuz(meta: Pick<QuranMeta, 'divisions'>, j: number): number {
  const starts = pageStarts(meta);
  const st = meta.divisions?.juz[j - 1];
  return starts && st ? pageOf(starts, st[0], st[1]) : 1;
}

/** Double page « livre » : page impaire à droite, page paire à gauche (Muṣḥaf de Médine). */
export function spreadOf(p: number): readonly [number, number] {
  const right = p % 2 === 1 ? p : p - 1;
  return [right, Math.min(PAGE_COUNT, right + 1)];
}

export const clampPage = (p: number) =>
  Math.max(1, Math.min(PAGE_COUNT, Math.round(Number.isFinite(p) ? p : 1)));

/** Page suivante ou précédente, d'une page ou d'une double page. */
export function stepPage(p: number, dir: 1 | -1, double: boolean): number {
  if (!double) return clampPage(p + dir);
  const [right] = spreadOf(p);
  return spreadOf(clampPage(right + 2 * dir))[0];
}

/**
 * Sens du balayage sur téléphone : le Muṣḥaf se lit de droite à gauche, la page suivante est « à gauche » ;
 * glisser le doigt vers la droite (dx > 0) avance donc d'une page, comme on tourne la page d'un livre arabe.
 */
export function swipeStep(dx: number, dy: number, min = 50): 1 | -1 | 0 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx > 0 ? 1 : -1;
}

/** Référence tapée dans la recherche : « 2:255 », « 2 255 », « p 50 », « page 50 », « juz 3 », « j 3 ». */
export type SearchRef =
  | { kind: 'verse'; s: number; a: number }
  | { kind: 'page'; p: number }
  | { kind: 'juz'; j: number }
  | { kind: 'sura'; s: number };
export function parseRef(q: string, lengths: readonly number[]): SearchRef | null {
  const x = q.trim().toLowerCase().replace(/\s+/g, ' ');
  let m = /^(\d{1,3})\s*[:. ]\s*(\d{1,3})$/.exec(x);
  if (m) {
    const s = Number(m[1]);
    const a = Number(m[2]);
    if (s >= 1 && s <= 114 && a >= 1 && a <= (lengths[s - 1] ?? 0)) return { kind: 'verse', s, a };
    return null;
  }
  m = /^(?:p|page)\s*(\d{1,3})$/.exec(x);
  if (m) {
    const p = Number(m[1]);
    return p >= 1 && p <= PAGE_COUNT ? { kind: 'page', p } : null;
  }
  m = /^(?:j|juz|juzʾ|juz')\s*(\d{1,2})$/.exec(x);
  if (m) {
    const j = Number(m[1]);
    return j >= 1 && j <= 30 ? { kind: 'juz', j } : null;
  }
  m = /^(\d{1,3})$/.exec(x);
  if (m) {
    const s = Number(m[1]);
    return s >= 1 && s <= 114 ? { kind: 'sura', s } : null;
  }
  return null;
}

/**
 * Forme de RECHERCHE d'un texte arabe (jamais affichée) : sans voyelles ni signes du Coran, alif waṣla et
 * formes de alif ramenées à ا, tatweel retiré. Sert seulement à comparer la saisie au texte.
 */
export function searchForm(text: string): string {
  return text
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱآأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Versets dont la forme de recherche contient la saisie (au plus `max`). */
export function searchVerses(
  verses: ReadonlyArray<{ s: number; a: number; text: string }>,
  q: string,
  max = 50,
): Array<{ s: number; a: number }> {
  const needle = searchForm(q);
  if (needle.length < 2) return [];
  const out: Array<{ s: number; a: number }> = [];
  for (const v of verses) {
    if (searchForm(v.text).includes(needle)) out.push({ s: v.s, a: v.a });
    if (out.length >= max) break;
  }
  return out;
}

/** Réglages gardés sur l'appareil (jamais envoyés). */
export interface MushafPrefs {
  kind: MushafKind;
  /** traduction affichée à côté : clé QuranEnc, ou '' (aucune) */
  translation: string;
  /** lecture seule : pas de sélection de verset ni de surlignage au toucher */
  readOnly: boolean;
  /** test de mémorisation : niveau de masquage 0 (visible) à 3 (caché) */
  memo: number;
  /** vue mobile (une page à la fois) même sur grand écran */
  single: boolean;
  /** répétition : nombre d'écoutes de chaque verset (1 à 20) et de la plage (1 à 20) */
  repeatVerse: number;
  repeatRange: number;
  page: number;
}
export const DEFAULT_PREFS: MushafPrefs = {
  kind: 'hafs',
  translation: 'french_rashid',
  readOnly: false,
  memo: 0,
  single: false,
  repeatVerse: 1,
  repeatRange: 1,
  page: 1,
};
const KEY = 'awzid.mushaf.v1';
const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const clampInt = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
};
export function readPrefs(store: Pick<Storage, 'getItem'> | null = storage()): MushafPrefs {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? '{}') as Partial<MushafPrefs>;
    const kind =
      MUSHAF_KINDS.find((k) => k.id === raw.kind && k.available)?.id ?? DEFAULT_PREFS.kind;
    return {
      kind,
      translation:
        typeof raw.translation === 'string' ? raw.translation : DEFAULT_PREFS.translation,
      readOnly: raw.readOnly === true,
      memo: clampInt(raw.memo, 0, 3, 0),
      single: raw.single === true,
      repeatVerse: clampInt(raw.repeatVerse, 1, 20, 1),
      repeatRange: clampInt(raw.repeatRange, 1, 20, 1),
      page: clampInt(raw.page, 1, PAGE_COUNT, 1),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
export function writePrefs(
  p: MushafPrefs,
  store: Pick<Storage, 'setItem'> | null = storage(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : réglages pour la session seulement */
  }
}

/** File d'écoute : chaque verset `perVerse` fois, la plage entière `range` fois. */
export function repeatQueue(from: number, to: number, perVerse: number, range: number): number[] {
  const one: number[] = [];
  for (let a = from; a <= to; a++) for (let k = 0; k < Math.max(1, perVerse); k++) one.push(a);
  return Array.from({ length: Math.max(1, range) }, () => one).flat();
}
