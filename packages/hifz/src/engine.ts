/**
 * Révision adaptée au Coran (ARCHITECTURE_V2 § 2.3), fidèle aux carnets AWFORM :
 *  - trois pistes chaque jour : RÉCENT (J+1, J+2, J+3, J+7, J+14, J+30 après l'apprentissage),
 *    NOUVEAU (portion du rythme), ANCIEN (roue de révision, « manzil ») ;
 *  - règle d'arrêt : plus d'une aide à J+3 ou J+7 → pas de nouvelle portion le lendemain ;
 *  - solidité S de chaque part (0 à 1), mise à jour selon la source du résultat (maître 1 ; voix 0,6 ;
 *    parent ou camarade 0,5 ; auto-évaluation 0,3) [ESTIMATION, à régler au pilote] ;
 *  - révision ancienne PLAFONNÉE au budget B, parts FRAGILES d'abord, jamais plus de 30 jours entre deux
 *    révisions tant que le budget suffit ; au-delà, la dette est signalée et une décision est PROPOSÉE à
 *    l'enseignant ou à l'adulte (aucune suspension automatique).
 * Tout est calculé sur l'appareil, hors ligne, à partir du journal immuable des événements.
 */

/** Étapes de la révision récente, en jours après l'apprentissage. */
export const STEPS = [1, 2, 3, 7, 14, 30] as const;
/** Étape « roue de révision ancienne ». */
export const MANZIL = STEPS.length;
export const MAX_GAP = 30;
export const ALPHA = 0.4;

export type Source = 'auto' | 'parent' | 'enseignant' | 'voix';
export const SOURCE_WEIGHT: Record<Source, number> = {
  enseignant: 1,
  voix: 0.6,
  parent: 0.5,
  auto: 0.3,
};

/** q : 3 sans aide, 2 hésitations, 1 une aide, 0 plusieurs aides ou oubli. */
export type Quality = 0 | 1 | 2 | 3;

export interface HifzEvent {
  /** jour (entier : jours depuis le 1970-01-01, fuseau de l'appareil) */
  day: number;
  /** ordre dans le journal (identifiant UUIDv7, horodaté) */
  id: string;
  part: string;
  kind: 'appris' | 'revision';
  q?: Quality;
  source: Source;
  /** mode rythme : position atteinte dans la séquence après une portion apprise */
  pos?: number;
}

export interface PartInfo {
  key: string;
  /** taille estimée en pages */
  pages: number;
  /** passage avec un verset jumeau (mutashābihāt) */
  twin?: boolean;
}

export interface PartState extends PartInfo {
  learnedDay: number | null;
  /** 0..5 : prochaine étape récente (STEPS[stage]) ; 6 : roue de révision ancienne */
  stage: number;
  due: number;
  S: number;
  lastQ: Quality | null;
  lastReview: number | null;
  /** dernier jour où l'étape a avancé (une seule avancée par jour) */
  advancedOn: number | null;
  reviews: number;
}

export interface EngineConfig {
  /** temps quotidien total (minutes) */
  dailyMinutes: number;
  /** temps de la nouvelle portion (minutes) */
  newMinutes: number;
  /** minutes pour réciter une page en révision [ESTIMATION : 3] */
  minutesPerPage?: number;
  /** cycle de la roue (jours) ; sinon calculé selon l'acquis */
  cycle?: number;
}

export interface HifzState {
  parts: Map<string, PartState>;
  /** jour sans nouvelle portion (règle d'arrêt) */
  stopDays: Set<number>;
  /** jours consécutifs où la dette dépasse 3 × B */
  debtStreak: number;
  /** position atteinte dans la séquence (mode rythme) */
  pos: number;
}

export function newState(parts: readonly PartInfo[]): HifzState {
  const m = new Map<string, PartState>();
  for (const p of parts)
    m.set(p.key, {
      ...p,
      learnedDay: null,
      stage: 0,
      due: Number.MAX_SAFE_INTEGER,
      S: 0,
      lastQ: null,
      lastReview: null,
      advancedOn: null,
      reviews: 0,
    });
  return { parts: m, stopDays: new Set(), debtStreak: 0, pos: 0 };
}

/** Pages acquises (parts commencées). */
export function acquiredPages(st: HifzState): number {
  let p = 0;
  for (const s of st.parts.values()) if (s.learnedDay !== null) p += s.pages;
  return p;
}

/**
 * Cycle de la roue (jours pour faire le tour de l'acquis), d'après la table des carnets : petit acquis →
 * tour en 3 jours ; partie 30 en cours → 7 ; partie 30 → 12 ; au-delà, ≈ 13 pages par jour au plus,
 * JAMAIS plus de 30 jours [ESTIMATION au-delà de 20 pages, à régler au pilote].
 */
export function cycleFor(pages: number): number {
  if (pages <= 2) return 3;
  if (pages <= 10) return 7;
  if (pages <= 20) return 12;
  return Math.min(MAX_GAP, Math.max(12, Math.ceil(pages / 13.4)));
}

/** Part des jours travaillés (≈ 220 jours par an). */
export const WORK_RATIO = 220 / 365;

/**
 * Temps d'une séance nécessaire pour tenir la roue (tour ≤ 30 jours) les jours travaillés : il grandit
 * avec l'acquis. Montré honnêtement à l'élève et à l'enseignant (simulateur : à temps constant, le
 * rythme « 7 ans » accumule une dette de révision en fin de parcours).
 */
export function requiredMinutes(st: HifzState, cfg: EngineConfig): number {
  const acq = acquiredPages(st);
  const c = cfg.cycle ?? cycleFor(acq);
  return Math.max(
    cfg.dailyMinutes,
    ((acq / c) * (cfg.minutesPerPage ?? 3)) / WORK_RATIO + cfg.newMinutes + 5,
  );
}

function factor(S: number): number {
  if (S < 0.5) return 0.5;
  if (S > 0.9) return 1.3;
  return 1;
}

function manzilDue(st: HifzState, p: PartState, day: number, cfg: EngineConfig): number {
  const c = cfg.cycle ?? cycleFor(acquiredPages(st));
  return day + Math.max(1, Math.min(MAX_GAP, Math.round(c * factor(p.S))));
}

/** Applique un événement (ordre du journal). Les événements sur une part inconnue sont ignorés. */
export function apply(st: HifzState, ev: HifzEvent, cfg: EngineConfig): void {
  if (ev.kind === 'appris' && ev.pos !== undefined) st.pos = Math.max(st.pos, ev.pos);
  const p = st.parts.get(ev.part);
  if (!p) return;
  if (ev.kind === 'appris') {
    // nouvelle portion d'une part : la part (re)commence la révision récente
    if (p.learnedDay === null || p.stage < MANZIL) {
      p.learnedDay = ev.day;
      p.stage = 0;
      p.due = ev.day + STEPS[0];
      p.S = Math.max(p.S, 0.3);
    }
    return;
  }
  const q = ev.q ?? 0;
  const w = SOURCE_WEIGHT[ev.source];
  p.S = Math.min(1, Math.max(0, p.S + w * ALPHA * (q / 3 - p.S)));
  p.lastQ = q;
  p.reviews++;
  const firstToday = p.advancedOn !== ev.day;
  p.lastReview = ev.day;
  if (p.learnedDay === null) {
    // révision d'une part apprise avant l'application (acquis déclaré) : elle entre dans la roue
    p.learnedDay = ev.day;
    p.stage = MANZIL;
  }
  if (p.stage < MANZIL) {
    // règle d'arrêt : à J+3 ou J+7, plus d'une aide → pas de nouveau le lendemain
    if (q === 0 && (STEPS[p.stage] === 3 || STEPS[p.stage] === 7)) st.stopDays.add(ev.day + 1);
    if (q === 0) {
      p.due = ev.day + 1;
      return;
    }
    if (!firstToday) return;
    p.advancedOn = ev.day;
    p.stage++;
    if (p.stage >= MANZIL) p.due = manzilDue(st, p, ev.day, cfg);
    else p.due = Math.max((p.learnedDay ?? ev.day) + STEPS[p.stage]!, ev.day + 1);
    return;
  }
  if (!firstToday && q > 0) return;
  p.advancedOn = ev.day;
  p.due = q === 0 ? ev.day + 1 : manzilDue(st, p, ev.day, cfg);
}

export interface DueItem {
  key: string;
  pages: number;
  minutes: number;
  S: number;
  late: number;
  /** étape récente (1, 2, 3, 7, 14, 30) ou null pour la roue */
  step: number | null;
  fragile: boolean;
  priority: number;
}

export interface DayPlan {
  day: number;
  recent: DueItem[];
  manzil: DueItem[];
  /** révisions anciennes échues qui ne tiennent pas dans le budget */
  overdue: DueItem[];
  newAllowed: boolean;
  stopRule: boolean;
  budget: number;
  minutes: { recent: number; nouveau: number; manzil: number };
  debtMinutes: number;
  /** dette > 3 × B pendant 7 jours : proposer (réduire le nouveau, suspendre une semaine, changer de rythme) */
  proposeRelief: boolean;
}

export function planDay(st: HifzState, day: number, cfg: EngineConfig): DayPlan {
  const mpp = cfg.minutesPerPage ?? 3;
  const item = (p: PartState, step: number | null): DueItem => {
    const late = Math.max(0, day - p.due);
    return {
      key: p.key,
      pages: p.pages,
      minutes: p.pages * mpp,
      S: p.S,
      late,
      step,
      fragile: p.S < 0.5,
      priority: (late + 1) * (1.5 - p.S) * (p.twin ? 1.3 : 1),
    };
  };
  const recent: DueItem[] = [];
  const candidates: DueItem[] = [];
  for (const p of st.parts.values()) {
    if (p.learnedDay === null || p.due > day) continue;
    if (p.stage < MANZIL) recent.push(item(p, STEPS[p.stage]!));
    else candidates.push(item(p, null));
  }
  recent.sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  candidates.sort((a, b) => b.priority - a.priority);
  const recentMin = recent.reduce((s, r) => s + r.minutes, 0);
  const stopRule = st.stopDays.has(day);
  const newMin = stopRule ? 0 : cfg.newMinutes;
  const budget = Math.max(cfg.dailyMinutes - recentMin - newMin, cfg.dailyMinutes / 3);
  const manzil: DueItem[] = [];
  const overdue: DueItem[] = [];
  let used = 0;
  for (const c of candidates) {
    if (manzil.length === 0 || used + c.minutes <= budget) {
      manzil.push(c);
      used += c.minutes;
    } else overdue.push(c);
  }
  const debtMinutes = overdue.reduce((s, o) => s + o.minutes, 0);
  return {
    day,
    recent,
    manzil,
    overdue,
    newAllowed: !stopRule,
    stopRule,
    budget,
    minutes: { recent: recentMin, nouveau: newMin, manzil: used },
    debtMinutes,
    proposeRelief: st.debtStreak >= 7,
  };
}

/** Fin de journée : met à jour la série de jours en dette (> 3 × B). */
export function closeDay(st: HifzState, plan: DayPlan): void {
  st.debtStreak = plan.debtMinutes > 3 * plan.budget ? st.debtStreak + 1 : 0;
}

/**
 * Rejoue le journal du premier jour à `today` (inclus) et renvoie l'état et le plan du jour. Les
 * événements sont triés par jour puis par identifiant (UUIDv7 : ordre de création).
 */
export function replay(
  parts: readonly PartInfo[],
  events: readonly HifzEvent[],
  today: number,
  cfg: EngineConfig,
  startDay?: number,
): { state: HifzState; plan: DayPlan } {
  const st = newState(parts);
  const sorted = [...events].sort(
    (a, b) => a.day - b.day || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  let d = startDay ?? sorted[0]?.day ?? today;
  let i = 0;
  for (; d < today; d++) {
    while (i < sorted.length && sorted[i]!.day <= d) apply(st, sorted[i++]!, cfg);
    closeDay(st, planDay(st, d, cfg));
  }
  while (i < sorted.length && sorted[i]!.day <= today) apply(st, sorted[i++]!, cfg);
  return { state: st, plan: planDay(st, today, cfg) };
}

/** Jour entier (fuseau local) d'une date. */
export function dayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** Jour entier d'une date ISO « AAAA-MM-JJ ». */
export function dayOfIso(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

export function isoOfDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}
