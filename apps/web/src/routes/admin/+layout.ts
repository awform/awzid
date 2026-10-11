import { loadStaffTexts, loadTexts } from '$lib/i18n';
import type { LayoutLoad } from './$types';

/** A37 : textes français du personnel (hors de la coquille de l'élève) chargés avant d'afficher ses pages. */
export const load: LayoutLoad = async () => {
  // F5 : aussi les textes des pages rares (noms des offres, statuts d'abonnement, catégories des avis)
  await Promise.all([loadStaffTexts(), loadTexts('rares')]);
};
