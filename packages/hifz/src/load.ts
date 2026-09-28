/**
 * Charge quotidienne du hifẓ (décision du pilote, 28/09) : la révision dépend de la QUANTITÉ DÉJÀ
 * MÉMORISÉE et du cycle de la roue choisi par l'enseignant, pas du rythme. Les temps sont donc toujours
 * donnés en fourchette « début de parcours → fin de parcours ».
 * Hypothèses [ESTIMATION, à mesurer au pilote] : 15 min pour apprendre une page nouvelle (cinq gestes),
 * 3 min pour réciter une page en révision, 220 jours travaillés par an (révision concentrée sur ces jours).
 */
import { cycleFor, STEPS, WORK_RATIO } from './engine.js';
import { TOTAL_PAGES } from './quran.js';
import type { Rhythm } from './rhythms.js';

export const NEW_MIN_PER_PAGE = 15;
export const REVIEW_MIN_PER_PAGE = 3;

export interface SessionLoad {
  nouveau: number;
  recent: number;
  ancien: number;
  total: number;
}

/** Temps d'une séance (jour travaillé) quand `acquired` pages sont déjà mémorisées. */
export function sessionLoad(
  r: Pick<Rhythm, 'pagesPerDay'>,
  acquired: number,
  maxCycle: number,
  newFactor = 1,
): SessionLoad {
  const nouveau = r.pagesPerDay * newFactor * NEW_MIN_PER_PAGE;
  // révision récente : chaque portion apprise revient aux 6 étapes J+1 … J+30
  const recent = r.pagesPerDay * newFactor * STEPS.length * REVIEW_MIN_PER_PAGE;
  const ancien =
    acquired > 0
      ? ((acquired / cycleFor(acquired, maxCycle)) * REVIEW_MIN_PER_PAGE) / WORK_RATIO
      : 0;
  return { nouveau, recent, ancien, total: nouveau + recent + ancien };
}

export interface Forecast {
  years: number;
  cycle: number;
  /** jours de travail pour tout le Coran */
  workDays: number;
  /** séance en début de parcours (minutes) */
  startMinutes: number;
  /** séance en fin de parcours, tout le Coran dans la roue (minutes) */
  endMinutes: number;
  /** pages révisées par jour travaillé en fin de parcours */
  endPagesPerDay: number;
}

export function forecast(r: Rhythm, cycle: number): Forecast {
  const start = sessionLoad(r, 0, cycle);
  const end = sessionLoad(r, TOTAL_PAGES, cycle);
  return {
    years: r.years,
    cycle,
    workDays: Math.ceil(TOTAL_PAGES / r.pagesPerDay),
    startMinutes: Math.round(start.total),
    endMinutes: Math.round(end.total),
    endPagesPerDay: Math.round((TOTAL_PAGES / cycle / WORK_RATIO) * 10) / 10,
  };
}
