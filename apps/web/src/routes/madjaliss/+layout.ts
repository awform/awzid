import { loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** Madjaliss : textes français de la rubrique (`fr-madjaliss`, hors de la coquille), gardés au premier usage. */
export const load: LayoutLoad = async () => {
  await loadTexts('madjaliss');
};
