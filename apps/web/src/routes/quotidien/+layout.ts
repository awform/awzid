import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** A37 : textes français de l'espace « Prières » (hors de la coquille) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  await loadTexts('quotidien');
};
