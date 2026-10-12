import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** Hifẓ complet : textes français des outils du hifẓ (`fr-hifz`, hors de la coquille), gardés au premier usage. */
export const load: LayoutLoad = async () => {
  await loadTexts('hifz');
};
