/**
 * Signes de pause du muṣḥaf (waqf : ۖ ۗ ۘ ۙ ۚ ۛ ۜ, U+06D6 à U+06DC). Dans le texte Tanzil, ils sont séparés du mot
 * par une espace : découpé aux espaces, chacun devenait un « mot » à part, seul en début de ligne ou flottant
 * entre deux lignes (essai du client, 12/10/2026, pages 2 et 3). À l'AFFICHAGE seulement, chaque signe est
 * rattaché au mot qui le précède (même groupe insécable) ; le texte, ses espaces et le découpage en mots
 * (index du tajwid, du masquage, du surlignage) restent ceux de Tanzil, octet pour octet.
 */
export const PAUSE = /^[ۖ-ۜ]+$/;

/** Groupes d'index de mots : un mot suivi de ses signes de pause ; tout autre mot seul. */
export function pauseGroups(ws: readonly string[]): number[][] {
  const out: number[][] = [];
  ws.forEach((w, i) => {
    const last = out[out.length - 1];
    if (last && PAUSE.test(w)) last.push(i);
    else out.push([i]);
  });
  return out;
}
