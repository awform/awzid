/**
 * Indication des madd (25/10/2026) : point d'entrée chargé À LA DEMANDE par le panneau « Réciter et vérifier » (adultes, interrupteur
 * `tajwid_madd`). Les textes français sont embarqués dans ce morceau ; ils ne pèsent rien dans la coquille de l'élève.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);
export { default as Madd } from './Madd.svelte';
