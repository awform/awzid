/**
 * Jalons de maîtrise (lots 11-12) : SEULEMENT des jalons, jamais de points cumulés ni de classement.
 * Coran : sourate complète, juzʾ, ḥizb (4 quarts) et quart de ḥizb complets — bornes OFFICIELLES
 * (métadonnées Tanzil : QuranData.Juz et QuranData.HizbQaurter). Sans métadonnées : ajzāʾ seulement
 * (bornes de @awform/hifz) ; aucune borne de ḥizb n'est inventée.
 */
import { JUZ_STARTS } from '@awform/hifz';

type Start = readonly [number, number];

/** Sourates dont TOUS les versets sont acquis. `counts[s-1]` = nombre de versets de la sourate s. */
export function completeSuras(acquis: ReadonlySet<string>, counts: readonly number[]): number[] {
  const out: number[] = [];
  counts.forEach((n, i) => {
    if (
      n > 0 &&
      Array.from({ length: n }, (_, a) => `${i + 1}:${a + 1}`).every((k) => acquis.has(k))
    )
      out.push(i + 1);
  });
  return out;
}

/** Numéros (1…) des segments [starts[i], starts[i+1]) entièrement acquis. */
export function completeSpans(
  starts: readonly Start[],
  acquis: ReadonlySet<string>,
  counts: readonly number[],
): number[] {
  const out: number[] = [];
  for (let j = 0; j < starts.length; j++) {
    const [s0, a0] = starts[j]!;
    const next = starts[j + 1];
    let s = s0;
    let a = a0;
    let all = true;
    while (s <= counts.length && (!next || s < next[0] || (s === next[0] && a < next[1]))) {
      if (!acquis.has(`${s}:${a}`)) {
        all = false;
        break;
      }
      a++;
      if (a > (counts[s - 1] ?? 0)) {
        s++;
        a = 1;
      }
    }
    if (all) out.push(j + 1);
  }
  return out;
}

/** Ajzāʾ (1 à 30) entièrement acquis (bornes officielles si fournies). */
export function completeJuz(
  acquis: ReadonlySet<string>,
  counts: readonly number[],
  juz: readonly Start[] = JUZ_STARTS,
): number[] {
  return completeSpans(juz, acquis, counts);
}

/** Aḥzāb (1 à 60) : un ḥizb = 4 quarts ; bornes = un quart sur quatre. */
export function completeHizb(
  acquis: ReadonlySet<string>,
  counts: readonly number[],
  quarters: readonly Start[],
): number[] {
  return completeSpans(
    quarters.filter((_, i) => i % 4 === 0),
    acquis,
    counts,
  );
}

/** Quarts de ḥizb (1 à 240) entièrement acquis. */
export function completeQuarters(
  acquis: ReadonlySet<string>,
  counts: readonly number[],
  quarters: readonly Start[],
): number[] {
  return completeSpans(quarters, acquis, counts);
}
