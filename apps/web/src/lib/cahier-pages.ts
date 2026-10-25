/**
 * Cahier de lecture (20/10/2026) — FICHIER GÉNÉRÉ par `node scripts/cahier-donnees.mjs` depuis
 * packages/content/data/cahier/<niveau>.json : ne pas modifier à la main. Très petit (coquille de l’élève) : niveaux
 * qui ont un cahier et unités du livre qui n’ont pas de page (lien « page du jour » de la leçon ; la page elle-même
 * est choisie par le cahier, chargé à la demande).
 */
export const CAHIER_NIVEAUX: readonly string[] = ['ad1', 'en1', 'ado1'];
/** unités du livre (`ad1.l23`) qui n’ont pas de page de cahier (les autres unités de ces niveaux en ont) */
export const CAHIER_SANS_PAGE: readonly string[] = ['ad1.l23', 'ado1.l05'];
