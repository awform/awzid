/**
 * Activités en cours hors des pages « en cours » (ex. : panneau « Réciter et vérifier » du lecteur) : tant qu'il en
 * reste une, aucune mise à jour n'est appliquée ni aucun rechargement fait. Signalé par un événement du document.
 */
let occupations = 0;
export const EVT_OCCUPATION = 'awzid-occupation';
export function occuper(): () => void {
  occupations++;
  signalerOccupation();
  let libre = false;
  return () => {
    if (libre) return;
    libre = true;
    occupations--;
    signalerOccupation();
  };
}
export const activiteEnCours = (): boolean => occupations > 0;
function signalerOccupation() {
  try {
    globalThis.dispatchEvent?.(new Event(EVT_OCCUPATION));
  } catch {
    /* hors navigateur */
  }
}
