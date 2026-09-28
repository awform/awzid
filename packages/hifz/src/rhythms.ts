/**
 * Les cinq rythmes du hifẓ complet (ARCHITECTURE_V2 § 2.2, complément du fondateur du 28/09).
 * Ce sont des RYTHMES, jamais des garanties. Base : 604 pages, ≈ 220 jours de travail par an.
 * Temps des rythmes 4, 5 et 6 ans : interpolés [ESTIMATION], à remplacer par les mesures du pilote.
 */
export interface Rhythm {
  years: 3 | 4 | 5 | 6 | 7;
  /** nouvelle portion par jour de travail, en pages (≈) */
  pagesPerDay: number;
  /** ≈ lignes de 15 par page */
  linesPerDay: number;
  pagesPerYear: number;
  juzPerYear: number;
  /** temps quotidien, révision comprise (minutes) : bornes basse et haute */
  minutes: readonly [number, number];
  /** temps estimé ? (rythmes interpolés) */
  estimated: boolean;
}

export const WORK_DAYS_PER_YEAR = 220;

export const RHYTHMS: readonly Rhythm[] = [
  {
    years: 3,
    pagesPerDay: 0.9,
    linesPerDay: 13.5,
    pagesPerYear: 201,
    juzPerYear: 10,
    minutes: [150, 180],
    estimated: false,
  },
  {
    years: 4,
    pagesPerDay: 0.7,
    linesPerDay: 10.5,
    pagesPerYear: 151,
    juzPerYear: 7.5,
    minutes: [120, 120],
    estimated: true,
  },
  {
    years: 5,
    pagesPerDay: 0.55,
    linesPerDay: 8,
    pagesPerYear: 121,
    juzPerYear: 6,
    minutes: [90, 90],
    estimated: true,
  },
  {
    years: 6,
    pagesPerDay: 0.45,
    linesPerDay: 7,
    pagesPerYear: 101,
    juzPerYear: 5,
    minutes: [75, 75],
    estimated: true,
  },
  {
    years: 7,
    pagesPerDay: 0.4,
    linesPerDay: 6,
    pagesPerYear: 86,
    juzPerYear: 4.3,
    minutes: [45, 60],
    estimated: false,
  },
];

export function rhythm(years: number): Rhythm {
  const r = RHYTHMS.find((x) => x.years === years);
  if (!r) throw new Error(`rythme inconnu : ${years} ans`);
  return r;
}

/** Temps quotidien moyen d'un rythme (minutes). */
export function dailyMinutes(r: Rhythm): number {
  return (r.minutes[0] + r.minutes[1]) / 2;
}

/** Durée du mois d'essai (jours) au rythme « 7 ans » avant la proposition de rythme (règle 1). */
export const TRIAL_DAYS = 28;
