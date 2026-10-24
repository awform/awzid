/**
 * Cahier « Je parle » (24/10/2026) — point d'entrée chargé À LA DEMANDE par la page `/cahier-parler/[niveau]` (jamais
 * préchargé : liste `/_app/parler.json`, garde de poids dédiée dans scripts/budget.mjs). Les textes français de
 * l'interface du cahier voyagent avec son code.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Parler } from './Parler.svelte';
