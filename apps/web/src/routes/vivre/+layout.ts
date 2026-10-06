import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** A37 : textes français de l'espace « Vivre l'islam » (hors de la coquille) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  await loadTexts('vivre');
};
