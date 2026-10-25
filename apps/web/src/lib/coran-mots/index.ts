/**
 * « Mots du Coran » (interrupteur `coran_mots`, 25/10/2026) — point d'entrée CHARGÉ À LA DEMANDE : par le lecteur du Coran
 * (la bande « Je reconnais X % des mots » et le soulignement) et par la page `/coran/mots` (recherche et fiche racine). Jamais
 * préchargé sur l'appareil de l'élève (`PREMIER_USAGE_*` de scripts/groupes.mjs ; garde de poids dédiée dans
 * scripts/budget.mjs). Les textes français de l'interface voyagent avec le code ; les DONNÉES (GPL v3) viennent de l'API.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';
import './coran-mots.css';

ajouterTextes(textes);

export { default as Bande } from './Bande.svelte';
export { default as Recherche } from './Recherche.svelte';
/** donnée au texte coranique du lecteur (`connus`) : les mots reconnus d'un verset, tant que le soulignement est actif */
export { connusFn as connus, type ConnusFn } from './etat.svelte';
