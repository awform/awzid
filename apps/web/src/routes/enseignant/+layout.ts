import { loadStaffTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** A37 : textes français du personnel (hors de la coquille de l'élève) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  await loadStaffTexts();
};
