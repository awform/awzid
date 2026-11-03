/**
 * « Famille de mots » du Coran (interrupteur `racines_coran`, 3/11/2026) — point d'entrée CHARGÉ À LA DEMANDE par la page
 * `/coran/familles`. Jamais préchargé sur l'appareil de l'élève (`PREMIER_USAGE_*` de scripts/groupes.mjs). Les textes français de
 * l'interface voyagent avec le code ; les DONNÉES (283 familles) viennent de l'API, une famille à la fois.
 */
import textes from './textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);

export { default as Accueil } from './Accueil.svelte';
