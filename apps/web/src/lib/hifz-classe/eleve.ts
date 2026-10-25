/**
 * Hifẓ en classe — entrée du module côté élève et famille (pages « Ma classe » et « Famille », interrupteur `hifz_classe`) :
 * « M'enregistrer pour mon maître » (adultes consentants seulement) et le suivi des séances. Chargé à la demande.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Enregistrer } from './Enregistrer.svelte';
export { default as Suivi } from './Suivi.svelte';
