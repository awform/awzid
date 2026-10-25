/**
 * « La prière de A à Z » (25/10/2026) — point d'entrée CHARGÉ À LA DEMANDE par la page `/vivre/priere` (jamais préchargé :
 * liste `/_app/priere.json`, garde de poids dédiée dans scripts/budget.mjs). Les textes français de l'interface du parcours
 * voyagent avec son code ; le contenu du référent est dans `/priere-data/` (jamais dans le code).
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';
import './priere.css';

ajouterTextes(textes);

export { default as Priere } from './Priere.svelte';
