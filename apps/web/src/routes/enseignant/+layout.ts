import { loadStaffTexts, loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** A37 : textes français du personnel (hors de la coquille de l'élève) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  // récitateurs de la classe (`ca.*`) : textes de l'espace Coran
  await Promise.all([loadStaffTexts(), loadTexts('coran')]);
};
