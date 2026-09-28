/**
 * Mois d'essai (règle 1) et prévisions HONNÊTES d'un rythme.
 * Après 4 semaines au rythme « 7 ans », l'application PROPOSE un rythme d'après la rétention mesurée ;
 * l'enseignant (ou l'adulte autodidacte) décide. Seuils [ESTIMATION, à régler au pilote].
 */
import type { HifzEvent } from './engine.js';
import type { Rhythm } from './rhythms.js';

export interface TrialStats {
  /** part des révisions « J+7 » réussies sans aide (0 à 1), null si aucune */
  retention: number | null;
  /** nombre moyen d'aides (q ≤ 1) par révision */
  helpsPerReview: number;
  /** part des jours travaillés sur la période */
  regularity: number;
  days: number;
}

/**
 * `j7` : identifiants des événements qui étaient des révisions à l'étape J+7 (fournis par le rejeu),
 * sinon on prend toutes les révisions.
 */
export function trialStats(
  events: readonly HifzEvent[],
  startDay: number,
  today: number,
  j7?: ReadonlySet<string>,
): TrialStats {
  const days = Math.max(1, today - startDay);
  const rev = events.filter((e) => e.kind === 'revision' && e.day >= startDay && e.day < today);
  const ref = j7 ? rev.filter((e) => j7.has(e.id)) : rev;
  const retention = ref.length ? ref.filter((e) => e.q === 3).length / ref.length : null;
  const helps = rev.filter((e) => (e.q ?? 0) <= 1).length;
  const worked = new Set(
    events.filter((e) => e.day >= startDay && e.day < today).map((e) => e.day),
  );
  return {
    retention,
    helpsPerReview: rev.length ? helps / rev.length : 0,
    regularity: Math.min(1, worked.size / Math.min(days, 28)),
    days,
  };
}

/** Rythme proposé à la fin du mois d'essai (jamais imposé). */
export function suggestRhythm(s: TrialStats): Rhythm['years'] {
  if (s.retention === null || s.regularity < 0.6) return 7;
  if (s.retention >= 0.9 && s.regularity >= 0.9 && s.helpsPerReview < 0.1) return 5;
  if (s.retention >= 0.75 && s.regularity >= 0.8) return 6;
  return 7;
}
