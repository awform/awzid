import type { VerseMark } from '@awform/content/versets';

/** Verset repéré par le serveur sur le texte Tanzil (`verset_tanzil` d'un point), sinon null. */
export function vmark(x: unknown): VerseMark | null {
  const m = (x as { verset_tanzil?: VerseMark } | null)?.verset_tanzil;
  return m && typeof m.i === 'number' ? m : null;
}

/** référence écrite par le livre à la fin de la traduction : « … » (Al-Bayyina 98:5, extrait). */
const REF_TAIL = /\s*\(([^()]*?(\d{1,3})\s*:\s*(\d{1,3})[^()]*)\)\s*[.;]?\s*$/;

/**
 * Sépare la référence du verset de sa traduction (affichage seulement, sur deux lignes) : la référence écrite
 * par le livre à la fin du texte français si elle désigne ce verset, sinon « Sourate s:a » calculée à partir
 * du passage repéré dans le texte Tanzil (aucune référence si le passage est ambigu).
 */
export function splitVerseRef(
  fr: string,
  m: Pick<VerseMark, 's' | 'a' | 'a2'>,
  suraName: string,
): { ref: string; sens: string } {
  const x = REF_TAIL.exec(fr ?? '');
  if (x) {
    const s = Number(x[2]);
    const a = Number(x[3]);
    if (!m.s || (s === m.s && a >= (m.a ?? 0) && a <= (m.a2 ?? m.a ?? 0)))
      return { ref: x[1]!.trim(), sens: fr.slice(0, x.index).trim() };
  }
  const ref = m.s && m.a ? `${suraName} ${m.s}:${m.a}${m.a2 ? `-${m.a2}` : ''}`.trim() : '';
  return { ref, sens: (fr ?? '').trim() };
}
