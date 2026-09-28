/**
 * Mois d'essai (règle 1) et prévisions HONNÊTES d'un rythme.
 * Après 4 semaines au rythme « 7 ans », l'application PROPOSE un rythme d'après la rétention mesurée ;
 * l'enseignant (ou l'adulte autodidacte) décide. Seuils [ESTIMATION, à régler au pilote].
 */
import type { HifzEvent } from './engine.js';
import { RHYTHMS, type Rhythm } from './rhythms.js';
import { TOTAL_PAGES } from './quran.js';

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

export interface Forecast {
  years: number;
  /** jours de travail pour tout le Coran */
  workDays: number;
  /** temps quotidien annoncé (minutes) */
  minutes: readonly [number, number];
  /** charge de la révision ancienne en fin de parcours (minutes par jour, 3 min par page, tour ≤ 30 j) */
  finalRevisionMinutes: number;
  /** même charge ramenée aux seuls jours travaillés (≈ 220 par an) : la séance réelle en fin de parcours */
  finalSessionMinutes: number;
}

export function forecast(years: Rhythm['years'], minutesPerPage = 3): Forecast {
  const r = RHYTHMS.find((x) => x.years === years)!;
  const perDay = (TOTAL_PAGES / 30) * minutesPerPage;
  return {
    years,
    workDays: Math.ceil(TOTAL_PAGES / r.pagesPerDay),
    minutes: r.minutes,
    finalRevisionMinutes: Math.round(perDay),
    finalSessionMinutes: Math.round(perDay / (220 / 365)),
  };
}
