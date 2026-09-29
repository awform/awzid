/**
 * FSRS (Free Spaced Repetition Scheduler, version 5) pour les cartes de mots (lot 15, remplace Leitner).
 * Modèle à trois grandeurs : difficulté D (1 à 10), stabilité S (jours pour que la probabilité de rappel
 * tombe à 90 %), et rappel R(t) = (1 + FACTOR·t/S)^DECAY. Paramètres par défaut publiés de FSRS-5 ;
 * rétention visée 90 %. Deux réponses seulement dans l'application : « je savais » (Good, 3) et « à revoir »
 * (Again, 1) — pas de note pénible pour un enfant. Tout reste sur l'appareil (hors ligne).
 */

/** Paramètres par défaut de FSRS-5 (w0 à w18). */
export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const RETENTION = 0.9;
export const MAX_INTERVAL = 365;

export type Grade = 1 | 2 | 3 | 4;

export interface CardState {
  /** stabilité (jours) */
  s: number;
  /** difficulté (1 à 10) */
  d: number;
  /** dernière révision et prochaine échéance (AAAA-MM-JJ, jour de l'élève) */
  last: string;
  due: string;
  reps: number;
  lapses: number;
}

const w = (i: number) => W[i]!;
const clampD = (d: number) => Math.min(10, Math.max(1, d));

export function initDifficulty(g: Grade): number {
  return clampD(w(4) - Math.exp(w(5) * (g - 1)) + 1);
}
export function initStability(g: Grade): number {
  return Math.max(0.1, w(g - 1));
}

/** Probabilité de rappel après `t` jours pour une stabilité `s`. */
export function retrievability(t: number, s: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY);
}

/** Intervalle (jours entiers, 1 à 365) pour atteindre la rétention visée. */
export function interval(s: number, retention = RETENTION): number {
  const i = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(i)));
}

export function nextDifficulty(d: number, g: Grade): number {
  const delta = -w(6) * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  // retour vers la difficulté « facile » initiale (évite l'enfer des cartes difficiles)
  return clampD(w(7) * initDifficulty(4) + (1 - w(7)) * damped);
}

export function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? w(15) : 1;
  const easy = g === 4 ? w(16) : 1;
  return (
    s *
    (1 +
      Math.exp(w(8)) *
        (11 - d) *
        Math.pow(s, -w(9)) *
        (Math.exp(w(10) * (1 - r)) - 1) *
        hard *
        easy)
  );
}

export function forgetStability(d: number, s: number, r: number): number {
  const sf = w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  return Math.min(s, Math.max(0.1, sf));
}

/** Révision le jour même (FSRS-5) : la stabilité évolue peu. */
export function shortTermStability(s: number, g: Grade): number {
  return s * Math.exp(w(17) * (g - 3 + w(18)));
}

const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Nouvel état d'une carte après une réponse le jour `today`. */
export function review(prev: CardState | undefined, g: Grade, today: string): CardState {
  if (!prev) {
    const s = initStability(g);
    const d = initDifficulty(g);
    // oubli d'une carte nouvelle : revue le lendemain
    const i = g === 1 ? 1 : interval(s);
    return { s, d, last: today, due: addDays(today, i), reps: 1, lapses: g === 1 ? 1 : 0 };
  }
  const t = days(prev.last, today);
  const r = retrievability(t, prev.s);
  const d = nextDifficulty(prev.d, g);
  let s: number;
  if (t <= 0) s = shortTermStability(prev.s, g);
  else if (g === 1) s = forgetStability(prev.d, prev.s, r);
  else s = recallStability(prev.d, prev.s, r, g);
  const i = g === 1 ? 1 : interval(s);
  return {
    s,
    d,
    last: today,
    due: addDays(today, i),
    reps: prev.reps + 1,
    lapses: prev.lapses + (g === 1 ? 1 : 0),
  };
}

/** Ancien état de Leitner (boîtes 1 à 5 : 1, 2, 4, 8, 16 jours). */
export interface LeitnerState {
  box: number;
  due: string;
}
const LEITNER = [1, 2, 4, 8, 16];

/**
 * Migration Leitner → FSRS : l'intervalle de la boîte devient la stabilité (à 90 % de rétention,
 * intervalle ≈ stabilité), difficulté moyenne (celle d'une première réponse « je savais »), échéance
 * conservée (aucune carte n'avance ni ne recule), dernière révision déduite.
 */
export function fromLeitner(l: LeitnerState): CardState {
  const i = LEITNER[Math.min(LEITNER.length, Math.max(1, l.box)) - 1]!;
  return {
    s: i,
    d: initDifficulty(3),
    last: addDays(l.due, -i),
    due: l.due,
    reps: Math.max(1, l.box),
    lapses: 0,
  };
}

export function isLeitner(x: unknown): x is LeitnerState {
  return !!x && typeof x === 'object' && 'box' in x && !('s' in x);
}
