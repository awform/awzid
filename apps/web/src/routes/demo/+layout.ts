import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** F5 : textes des pages rares (en ligne seulement, hors de la coquille de l'élève) chargés avant la page. */
export const load: LayoutLoad = async () => {
  await loadTexts('rares');
};
