/**
 * Jalons de maîtrise (lot 11) : SEULEMENT des jalons, jamais de points cumulés ni de classement.
 * Coran : sourate complète, juzʾ complet (bornes des ajzāʾ : @awform/hifz, JUZ_STARTS). Les ḥizb et quarts
 * de ḥizb attendent la table officielle des aḥzāb (métadonnées Tanzil) dans la copie des livres : aucune
 * borne n'est inventée ici.
 */
import { JUZ_STARTS } from '@awform/hifz';

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

/** Ajzāʾ (1 à 30) entièrement acquis. */
export function completeJuz(acquis: ReadonlySet<string>, counts: readonly number[]): number[] {
  const out: number[] = [];
  for (let j = 0; j < JUZ_STARTS.length; j++) {
    const [s0, a0] = JUZ_STARTS[j]!;
    const next = JUZ_STARTS[j + 1];
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
