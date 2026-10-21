/**
 * Lecteur audio : réduit (lecture / pause et « Régler ») ou déplié (toutes les commandes). Le choix de l'élève est
 * gardé SUR L'APPAREIL ; stockage indisponible (navigation privée, données bloquées) : réduit, sans erreur.
 */
export const CLE_DEPLIE = 'awzid.lecteur.deplie';

export function lireDeplie(): boolean {
  try {
    return localStorage.getItem(CLE_DEPLIE) === '1';
  } catch {
    return false;
  }
}

export function garderDeplie(v: boolean): void {
  try {
    localStorage.setItem(CLE_DEPLIE, v ? '1' : '0');
  } catch {
    /* stockage indisponible : le choix vaut pour cette ouverture seulement */
  }
}

/** Dans un exercice, le lecteur reste réduit et ne se montre que pendant la lecture. */
export const dansExercice = (el: Element | null | undefined): boolean =>
  !!el?.closest('[data-exercise]');
