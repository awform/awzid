import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Textes de la page des récitateurs (page rare, en ligne seulement) : catalogue « rares », hors de l'appareil de l'élève. */
export const load: PageLoad = async () => {
  await loadTexts('rares');
};
