import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Douas : textes français de l'onglet (`fr-douas`, hors de la coquille), gardés au premier usage. */
export const load: PageLoad = async () => {
  await loadTexts('douas');
};
