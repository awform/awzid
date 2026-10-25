/**
 * Hifẓ en classe — entrée du module dans l'espace enseignant (onglet « Écoute » de la classe, interrupteur `hifz_classe`) : le mode
 * « direct » (AUCUN enregistrement), l'annotation des enregistrements d'adultes consentants et l'historique des séances. Chargé à la
 * demande, jamais préchargé (les pages du personnel ne sont pas dans l'appareil de l'élève).
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as HifzClasse } from './HifzClasse.svelte';
