/**
 * « Sens et explication » (tafsīr abrégé et mot à mot, interrupteur `tafsir_sens`, 2/11/2026) — point d'entrée CHARGÉ À LA DEMANDE par le
 * lecteur du Coran, au premier appui sur le petit menu d'un verset. Jamais préchargé sur l'appareil de l'élève (`PREMIER_USAGE_*` de
 * scripts/groupes.mjs ; garde de poids dédiée dans scripts/budget.mjs). Les textes français de l'interface voyagent avec le code ; les
 * DONNÉES (114 sourates) ne sont pas dans le code : l'API les sert une sourate à la fois, filtrées par public.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as SensVerset } from './SensVerset.svelte';
