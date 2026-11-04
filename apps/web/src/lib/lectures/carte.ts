/** Carte d'entrée des Lectures (Khalīl, Histoires), importée à la demande quand l'un des deux interrupteurs est ouvert. */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Carte } from './Carte.svelte';
