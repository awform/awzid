/**
 * Cahier de lecture (20/10/2026) — point d'entrée chargé À LA DEMANDE par la page `/cahier/[niveau]` (jamais
 * préchargé : liste `/_app/cahier.json`, garde de poids dédiée dans scripts/budget.mjs). Les textes français de
 * l'interface du cahier voyagent avec son code (gardés hors ligne avec lui).
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Cahier } from './Cahier.svelte';
