/**
 * Khatma de la classe — entrée du module dans l'espace enseignant (onglet « Sourates », interrupteur `khatma_wird`) :
 * chargée à la demande, jamais préchargée (les pages du personnel ne sont pas dans l'appareil de l'élève).
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as KhatmaClasse } from './KhatmaClasse.svelte';
