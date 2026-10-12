/**
 * Caches retirés à l'activation d'une nouvelle version du service worker (module pur, testé sans navigateur).
 *
 * Gardés : le cache de la version active ; la DERNIÈRE version précédente de la coquille (un onglet resté au milieu
 * d'une leçon pendant la mise à jour continue de trouver ses fichiers jusqu'à son retour sur un écran neutre) ;
 * les polices des riwāyāt, l'audio du Coran et le Muṣḥaf exact gardés par l'utilisateur.
 * Jamais touchés (ce ne sont pas des caches) : IndexedDB et localStorage — signets, progression, réglages,
 * niveaux téléchargés, file des réponses.
 */
export const PREFIXE_COQUILLE = 'awform-shell-';
export const CACHE_RIWAYAT = 'awzid-riwayat-polices';

const garde = (k: string) =>
  k === CACHE_RIWAYAT || k.startsWith('awzid-coran-audio') || k.startsWith('awzid-mushaf-exact');

/** `cles` dans l'ordre de `caches.keys()` (ordre de création) ; `actif` : cache de la version qui s'active. */
export function cachesARetirer(cles: readonly string[], actif: string): string[] {
  const anciennes = cles.filter((k) => k.startsWith(PREFIXE_COQUILLE) && k !== actif);
  const precedente = anciennes[anciennes.length - 1];
  return cles.filter((k) => k !== actif && k !== precedente && !garde(k));
}
