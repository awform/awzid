import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Lot F3 : textes français de la récupération du compte (hors de la coquille), chargés avant la page. */
export const load: PageLoad = async () => {
  await loadTexts('acces');
};
