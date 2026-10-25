/**
 * Mutashābihāt dans le hifẓ — entrée du module (interrupteur `mutashabihat`, coupé par défaut) : l'alerte « verset jumeau » et sa carte
 * (pendant la révision), la tuile et le test au hasard qui mélange les jumeaux. CHARGÉ À LA DEMANDE (groupe « en ligne » de
 * `groupes.mjs`) : jamais dans la coquille de l'élève, où seuls l'interrupteur et les appels de ce module figurent. Les données du
 * référent (`donnees.json`, paires « reconnues par la source » seulement) voyagent avec lui.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Jumeaux } from './Jumeaux.svelte';
export { default as Test } from './Test.svelte';
export { default as Tuile } from './Tuile.svelte';
