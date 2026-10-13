import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Bêta : textes de la page de vérification de l'adresse (pages rares, en ligne seulement). */
export const load: PageLoad = async () => {
  await loadTexts('rares');
};
