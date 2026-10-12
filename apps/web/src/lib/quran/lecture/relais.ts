/**
 * TOUCHER QUI TRAVERSE (essai du client, 12/10/2026, Xiaomi 412 × 915, Chrome Android : « Réglages n'est plus
 * tactile : dès que tu cliques, ça sort, ça fait rien »).
 *
 * Une feuille ou le menu d'un verset est ouvert (dialogue modal) ; l'élève touche « Réglages », « Traduction »,
 * la puce… dans la barre du lecteur, VISIBLE au-dessus du fond assombri. Avant : ce toucher était pris pour un
 * « toucher ailleurs » — la feuille se refermait et rien d'autre ne se passait. Désormais : la feuille se ferme
 * ET la commande touchée agit, d'un seul toucher. Seules les commandes marquées `data-relais` (barre du lecteur,
 * pastille d'écoute, proposition « Écouter ici ») sont ainsi atteintes ; un bouton déjà enfoncé (aria-pressed,
 * p. ex. « Traduction » quand sa feuille est ouverte) ne fait que fermer.
 */
export const RELAIS = '[data-relais]';
const CIBLE = 'button, a[href], summary';

/** Commande du lecteur sous le point (x, y), une fois le dialogue fermé ; null sinon. */
export function commandeSous(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(CIBLE) ?? null;
  if (!el || !el.closest(RELAIS)) return null;
  if (el.matches(':disabled') || el.getAttribute('aria-pressed') === 'true') return null;
  return el;
}

/**
 * Clic sur un dialogue modal : sur son FOND (hors de sa boîte), le ferme ; si une commande du lecteur est sous le
 * doigt, elle agit aussitôt. Renvoie vrai si le dialogue a été fermé.
 */
export function fondTouche(e: MouseEvent, dlg: HTMLDialogElement, fermer: () => void): boolean {
  if (e.target !== dlg) return false;
  fermer();
  const r = dlg.getBoundingClientRect();
  const dedans =
    e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  // clavier (Entrée sur le dialogue : coordonnées nulles) ou toucher dans la boîte : fermer seulement
  if (dedans || (e.clientX === 0 && e.clientY === 0)) return true;
  // fermé tout de suite : la page n'est plus inerte, la commande sous le doigt est atteignable
  if (dlg.open) dlg.close();
  const c = commandeSous(e.clientX, e.clientY);
  c?.click();
  return true;
}
