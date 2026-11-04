/**
 * Lectures (4/11/2026) — Mukhtaṣar Khalīl (interrupteur `khalil`) et « Histoire, de la création à nos jours » (interrupteur
 * `histoires`) : point d'entrée CHARGÉ À LA DEMANDE par les pages `/khalil` et `/histoires`, jamais préchargé sur l'appareil de
 * l'élève (`PREMIER_USAGE_*` de scripts/groupes.mjs). Les DONNÉES viennent de l'API, une partie à la fois ; les MP3 du serveur.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Khalil } from './Khalil.svelte';
export { default as Histoires } from './Histoires.svelte';
