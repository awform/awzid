import { loadLegal } from '$lib/legal/pages';
import type { PageLoad } from './$types';

/** A37 : version anglaise des textes légaux chargée à la demande (interface en anglais seulement). */
export const load: PageLoad = async ({ fetch }) => {
  await loadLegal(fetch);
};
