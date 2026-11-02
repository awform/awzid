/**
 * « Lecteur simple » (interrupteur `lecteur_simple`, 2/11/2026) — point d'entrée CHARGÉ À LA DEMANDE par le lecteur du Coran quand
 * l'interrupteur est ouvert (canal bêta) : le panneau « Outils » (Traduction, Grand texte, Retrouve ce verset, Réglages, souligner les
 * mots reconnus, sources) et le menu « ⋯ » de la barre audio compacte. Jamais préchargé sur l'appareil de l'élève (`PREMIER_USAGE_*` de
 * scripts/groupes.mjs) ; sans lui (hors ligne avant le premier usage), l'ancien affichage reste celui du lecteur. Les textes français
 * voyagent avec le code ; la mise en forme de la page (une ligne en haut, barre audio réduite) est dans `lecteur-simple.css`.
 */
import textes from './textes-fr.json';
import { ajouterTextes, fmtNumber, t } from '$lib/i18n';
import './lecteur-simple.css';

ajouterTextes(textes);

export { default as Outils } from './Outils.svelte';
export { default as MenuAudio } from './MenuAudio.svelte';

/** Textes que le lecteur affiche lui-même (il ne cite pas les clés du module) : l'état court de la barre audio. */
export const libelles = {
  position: (aya: number, total: number) =>
    t('ls.pos', { aya: fmtNumber(aya), total: fmtNumber(total) }),
};
