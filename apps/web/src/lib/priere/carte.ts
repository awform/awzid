/**
 * « La prière de A à Z » — entrée de la rubrique dans « Vivre l'islam » (interrupteur `parcours_priere`) : une carte, chargée
 * à la demande (jamais dans la coquille de l'élève : seul l'interrupteur et l'appel de ce module y sont).
 */
import textes from './textes-carte-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Carte } from './Carte.svelte';
