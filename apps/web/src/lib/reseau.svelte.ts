import { fn } from './fonctions.svelte';

/**
 * Chantier A2 — état du réseau partagé (événements « online » / « offline » du navigateur) : les récitateurs
 * EN LIGNE (Quran Foundation) sont désactivés proprement hors connexion (« disponible avec Internet »).
 */
export const reseau = $state({ enLigne: true });

if (typeof window !== 'undefined') {
  reseau.enLigne = navigator.onLine;
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}

/** Un récitateur peut-il être écouté maintenant ? (ceux du Complexe : toujours, fichiers gardés compris) */
export const ecoutable = (r: { enLigne?: boolean } | null | undefined, enLigne = reseau.enLigne) =>
  !!r && (!r.enLigne || (enLigne && fn('recitateurs_en_ligne')));

/** F5 : récitateur montré ? (un récitateur en ligne disparaît si l'interrupteur est coupé) */
export const montre = (r: { enLigne?: boolean } | null | undefined) =>
  !!r && (!r.enLigne || fn('recitateurs_en_ligne'));
