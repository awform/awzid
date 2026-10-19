import { loadTexts } from '$lib/i18n';
import type { PageLoad } from './$types';

/** Tuteur IA de conversation : textes français (`fr-tuteur`, hors de la coquille), jamais préchargés. */
export const load: PageLoad = async () => {
  await loadTexts('tuteur');
};
