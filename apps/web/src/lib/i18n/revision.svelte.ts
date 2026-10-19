/**
 * Compteur réactif des textes de l'interface : monte quand des catalogues sont rechargés après une clé manquante
 * (voir `guerir` dans `index.ts`), ce qui remet à jour les textes déjà affichés sans recharger la page.
 */
export const revision = $state({ n: 0 });
