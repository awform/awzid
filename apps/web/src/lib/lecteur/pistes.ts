/**
 * Lecteur audio : les phrases de la page ou de la séance sont les boutons « Écouter » présents à l'écran
 * (`data-lecteur="<famille>"`, `data-audio="<fichier>"`), dans l'ordre de la page. Aucune liste à tenir à jour :
 * ce que la page montre est ce que le lecteur enchaîne.
 */
import type { Piste } from './moteur.svelte';

export interface PisteDom extends Piste {
  declencheur: HTMLElement;
  /** l'élément surligné et ramené dans la vue pendant la lecture */
  cible: HTMLElement;
}

export const CLASSE_ACTIVE = 'lecteur-actif';

/** La phrase d'un bouton : sa fiche (Madjaliss, doua), sinon le texte arabe juste avant lui, sinon son parent. */
export function cibleDe(el: HTMLElement): HTMLElement {
  const fiche = el.closest<HTMLElement>('[data-phrase], [data-doua]');
  if (fiche) return fiche;
  const bloc = el.closest<HTMLElement>('.ecouter') ?? el;
  const avant = bloc.previousElementSibling as HTMLElement | null;
  if (avant?.getAttribute('lang') === 'ar') return avant;
  const parent = bloc.parentElement;
  if (parent && parent.querySelectorAll('[data-lecteur]').length === 1) return parent;
  return avant?.textContent?.trim() ? avant : bloc;
}

const visible = (el: HTMLElement) =>
  el.isConnected && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0;

/** Boutons « Écouter » visibles de la famille, dans l'ordre de la page. */
export function lirePistes(famille: string, racine: ParentNode = document): PisteDom[] {
  return [...racine.querySelectorAll<HTMLElement>(`[data-lecteur="${famille}"][data-audio]`)]
    .filter(visible)
    .map((el) => ({
      ref: el.dataset.audio ?? '',
      cle: el,
      declencheur: el,
      cible: cibleDe(el),
    }));
}

/** Ramène la phrase dans la vue si elle n'est pas déjà bien visible (au-dessus du lecteur). */
export function montrer(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight;
  if (r.top >= h * 0.08 && r.bottom <= h * 0.62) return;
  const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduit ? 'auto' : 'smooth' });
}
