import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Lot F3 : textes français des accords, de l'adresse et du fuseau (hors de la coquille), chargés avant la page. */
export const load: PageLoad = async () => {
  await loadTexts('acces');
};
