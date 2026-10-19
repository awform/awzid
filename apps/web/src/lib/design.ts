/**
 * Refonte 19/10/2026 (interrupteur `design_v4`, administrable sans redéploiement) : les écrans du nouveau design
 * (`$lib/v4/ecrans`) et leurs textes (`fr-design`) sont chargés À LA DEMANDE et gardés au premier usage — jamais
 * préchargés sur l'appareil de l'élève (scripts/groupes.mjs). S'ils ne peuvent pas être chargés (hors ligne avant le
 * premier usage), l'ANCIEN design s'affiche : il reste entier dans la coquille.
 */
import { loadTexts, t } from '$lib/i18n';

export type EcransV4 = typeof import('$lib/v4/ecrans');

let enCours: Promise<EcransV4 | null> | null = null;

export function chargerV4(): Promise<EcransV4 | null> {
  enCours ??= Promise.all([import('$lib/v4/ecrans'), loadTexts('design')])
    .then(([m]) => (t('v4.seance_du_jour').startsWith('⟦') ? null : m))
    .catch(() => null)
    .then((m) => {
      // échec : nouvel essai à la prochaine ouverture (le réseau a pu revenir)
      if (!m) enCours = null;
      return m;
    });
  return enCours;
}
