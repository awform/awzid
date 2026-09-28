/**
 * Plan du hifẓ COMPLET (604 pages) : ordre des sourates choisi par l'école, séquence de versets, parts de
 * révision (≈ 1 page, coupées de préférence en fin de sourate) et nouvelle portion du jour selon le rythme.
 * La portion suivante est calculée à partir du nombre de versets déjà appris : changer de rythme ne perd
 * rien (règle 2 : « le plan se recalcule »).
 */
import { pagesOf, TOTAL_PAGES, type QuranMeta } from './quran.js';

/**
 * « rebours » : Al-Fātiḥa, puis d'An-Nās vers Al-Baqara (usage courant des daaras d'Afrique de l'Ouest) ;
 * « juz30 » : Al-Fātiḥa, partie 30 (d'An-Nās à An-Nabaʾ), partie 29, puis d'Al-Baqara vers la fin.
 */
export type Order = 'rebours' | 'juz30';

export function suraOrder(order: Order): number[] {
  const out = [1];
  if (order === 'rebours') {
    for (let s = 114; s >= 2; s--) out.push(s);
    return out;
  }
  for (let s = 114; s >= 78; s--) out.push(s); // partie 30
  for (let s = 77; s >= 67; s--) out.push(s); // partie 29
  for (let s = 2; s <= 66; s++) out.push(s);
  return out;
}

export interface VerseRef {
  s: number;
  a: number;
}

/** Séquence d'apprentissage : chaque verset dans l'ordre de l'école (versets croissants dans une sourate). */
export function learningSequence(meta: QuranMeta, order: Order): VerseRef[] {
  const seq: VerseRef[] = [];
  for (const s of suraOrder(order)) {
    const n = meta.weights[s - 1]?.length ?? 0;
    for (let a = 1; a <= n; a++) seq.push({ s, a });
  }
  return seq;
}

export interface Segment {
  s: number;
  from: number;
  to: number;
}

/** Portion : une ou plusieurs courtes sourates entières, ou un passage d'une sourate. */
export interface Portion {
  /** indices [start, end) dans la séquence */
  start: number;
  end: number;
  segments: Segment[];
  pages: number;
}

const weightOf = (meta: QuranMeta, v: VerseRef) => meta.weights[v.s - 1]?.[v.a - 1] ?? 1;

export function segmentsOf(seq: readonly VerseRef[], start: number, end: number): Segment[] {
  const out: Segment[] = [];
  for (let i = start; i < end; i++) {
    const v = seq[i]!;
    const last = out[out.length - 1];
    if (last && last.s === v.s && last.to === v.a - 1) last.to = v.a;
    else out.push({ s: v.s, from: v.a, to: v.a });
  }
  return out;
}

/**
 * Nouvelle portion à partir de la position `start` pour une cible de `pages` pages :
 *  - une sourate courte qui tient dans la cible est prise entière ; plusieurs courtes sourates peuvent
 *    former une portion ;
 *  - une longue sourate est coupée entre deux versets ; si le reste de la sourate est petit (< moitié
 *    de la cible), il rejoint la portion ;
 *  - un verset plus long que la cible forme sa portion à lui seul (le maître indique les coupures de sens).
 */
export function nextPortion(
  meta: QuranMeta,
  seq: readonly VerseRef[],
  start: number,
  pages: number,
): Portion | null {
  if (start >= seq.length) return null;
  const target = (pages / TOTAL_PAGES) * meta.totalWeight;
  let i = start;
  let w = 0;
  while (i < seq.length) {
    const v = seq[i]!;
    // reste de la sourate courante à partir de i
    let restW = 0;
    let j = i;
    while (j < seq.length && seq[j]!.s === v.s) restW += weightOf(meta, seq[j++]!);
    if (v.a === 1 || i === start) {
      if (w + restW <= target * (w === 0 ? 1.25 : 1.1)) {
        // la fin de la sourate tient dans la portion
        w += restW;
        i = j;
        if (w >= target * 0.8) break;
        continue;
      }
      if (w > 0) break; // on ne commence pas une longue sourate dans une portion déjà commencée
    }
    // coupe à l'intérieur de la sourate, au verset le plus proche de la cible
    while (i < j) {
      const vw = weightOf(meta, seq[i]!);
      if (w > 0 && w + vw / 2 > target) break;
      w += vw;
      i++;
    }
    // petit reste de sourate : rattaché
    let tail = 0;
    for (let k = i; k < j; k++) tail += weightOf(meta, seq[k]!);
    if (i < j && tail < target * 0.25) {
      w += tail;
      i = j;
    }
    break;
  }
  return { start, end: i, segments: segmentsOf(seq, start, i), pages: pagesOf(meta, w) };
}

/** Toutes les portions du plan (pour estimer la durée et tester). */
export function allPortions(meta: QuranMeta, seq: readonly VerseRef[], pages: number): Portion[] {
  const out: Portion[] = [];
  let pos = 0;
  for (;;) {
    const p = nextPortion(meta, seq, pos, pages);
    if (!p || p.end <= pos) break;
    out.push(p);
    pos = p.end;
  }
  return out;
}

export interface Part {
  key: string;
  start: number;
  end: number;
  segments: Segment[];
  pages: number;
}

/**
 * Parts de la révision ancienne : ≈ 1 page chacune dans l'ordre d'apprentissage (groupes de courtes
 * sourates, ou morceaux d'une page d'une longue sourate), indépendantes du rythme.
 */
export function buildParts(meta: QuranMeta, seq: readonly VerseRef[]): Part[] {
  const page = meta.totalWeight / TOTAL_PAGES;
  const parts: Part[] = [];
  let start = 0;
  let w = 0;
  for (let i = 0; i < seq.length; i++) {
    w += weightOf(meta, seq[i]!);
    const endOfSura = i + 1 >= seq.length || seq[i + 1]!.s !== seq[i]!.s;
    if (w >= page || (endOfSura && w >= page * 0.6) || i + 1 === seq.length) {
      parts.push({
        key: `q${parts.length + 1}`,
        start,
        end: i + 1,
        segments: segmentsOf(seq, start, i + 1),
        pages: pagesOf(meta, w),
      });
      start = i + 1;
      w = 0;
    }
  }
  return parts;
}

/** Parts touchées par une portion (indices de séquence qui se recoupent). */
export function partsOverlapping(parts: readonly Part[], start: number, end: number): Part[] {
  return parts.filter((p) => p.start < end && p.end > start);
}
