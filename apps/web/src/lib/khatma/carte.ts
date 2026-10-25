/**
 * Khatma et wird — entrée du module dans l'accueil du Coran (interrupteur `khatma_wird`) : une carte, chargée à la demande
 * (jamais dans la coquille de l'élève : seuls l'interrupteur et l'appel de ce module y sont).
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Carte } from './Carte.svelte';
