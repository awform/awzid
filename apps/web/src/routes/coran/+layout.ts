import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** Textes français de l'espace Coran (hors de la coquille de l'élève) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  await loadTexts('coran');
};
