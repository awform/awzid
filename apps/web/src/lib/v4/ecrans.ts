/**
 * Refonte 19/10 (interrupteur `design_v4`) : UNE seule entrée à la demande pour les écrans v4 (`$lib/design`).
 * Une seule entrée, et non une par écran : les modules qu'ils partagent avec la rubrique Madjaliss (progression,
 * cursus, adresses) n'ont ainsi que deux importateurs et ne partent pas dans le morceau commun préchargé sur
 * l'appareil de l'élève (vite.config.ts, `minShareCount: 3`). Gardée au premier usage (scripts/groupes.mjs).
 */
export { default as AujourdhuiV4 } from './AujourdhuiV4.svelte';
export { default as ActivitesV4 } from './ActivitesV4.svelte';
