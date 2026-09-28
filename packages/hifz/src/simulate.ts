/**
 * Simulateur du hifẓ complet (ARCHITECTURE_V2 § 2.3) : un élève virtuel suit le plan jour après jour
 * (présence aléatoire, oublis selon la solidité S). Le temps de séance suit la charge réelle (quantité
 * acquise, cycle de la roue choisi) ; si le retard persiste, l'enseignant accepte l'allègement proposé.
 * Sert aux tests et au tableau « rythme × cycle » soumis à l'école pilote.
 */
import {
  acquiredPages,
  apply,
  closeDay,
  MANZIL,
  newState,
  planDay,
  type EngineConfig,
  type Quality,
} from './engine.js';
import { sessionLoad } from './load.js';
import { buildParts, learningSequence, nextPortion, partsOverlapping } from './plan.js';
import type { QuranMeta } from './quran.js';
import { rhythm } from './rhythms.js';

export interface SimProfile {
  name: string;
  /** probabilité d'oubli de base */
  forget: number;
  /** part des jours travaillés (220 / 365 ≈ 0,6) */
  regularity: number;
}

export interface SimResult {
  years: number;
  cycle: number;
  /** années pour tout le Coran (null : pas fini en `limitYears`) */
  yearsToFinish: number | null;
  /** séance moyenne (min) sur les 3 premiers mois et sur les 3 derniers mois avant la fin */
  startMinutes: number;
  endMinutes: number;
  /** plus longue attente d'une part de la roue (jours) */
  maxGap: number;
  /** attentes au-delà du cycle sans que la dette ait été signalée (doit rester 0) */
  violations: number;
  /** dépassements du budget de révision (doit rester 0) */
  budgetExceeded: number;
  /** allègements acceptés (nouveau réduit de moitié pendant 7 jours) */
  reliefs: number;
}

export function simulate(
  meta: QuranMeta,
  years: 3 | 4 | 5 | 6 | 7,
  cycle: number,
  prof: SimProfile,
  seed = 1,
  limitYears = 10,
): SimResult {
  const seq = learningSequence(meta, 'rebours');
  const parts = buildParts(meta, seq);
  const r = rhythm(years);
  const cfg: EngineConfig = { dailyMinutes: 0, newMinutes: 0, maxCycle: cycle };
  const st = newState(parts);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const lastReview = new Map<string, number>();
  const flagged = new Set<string>();
  const minutes: number[] = [];
  let n = 0;
  let reliefUntil = -1;
  let reliefs = 0;
  let violations = 0;
  let budgetExceeded = 0;
  let maxGap = 0;
  let finished = -1;
  for (let day = 0; day < 365 * limitYears; day++) {
    const factor = day < reliefUntil ? 0.5 : 1;
    const load = sessionLoad(r, acquiredPages(st), cycle, factor);
    cfg.dailyMinutes = load.total;
    cfg.newMinutes = load.nouveau;
    const plan = planDay(st, day, cfg);
    const maxPart = Math.max(0, ...plan.manzil.map((m) => m.minutes));
    if (plan.minutes.manzil > plan.budget + maxPart) budgetExceeded++;
    if (rnd() < prof.regularity) {
      minutes.push(
        plan.minutes.recent + plan.minutes.manzil + (plan.newAllowed ? load.nouveau : 0),
      );
      for (const item of [...plan.recent, ...plan.manzil]) {
        const p = st.parts.get(item.key)!;
        if (p.stage >= MANZIL) {
          const gap = day - (lastReview.get(item.key) ?? day);
          maxGap = Math.max(maxGap, gap);
          if (gap > cycle && !flagged.has(item.key)) violations++;
        }
        const success = 0.6 + 0.35 * p.S - prof.forget;
        const x = rnd();
        const q: Quality = x < success ? 3 : x < success + 0.15 ? 2 : x < success + 0.25 ? 1 : 0;
        apply(
          st,
          {
            day,
            id: String(n++).padStart(10, '0'),
            part: item.key,
            kind: 'revision',
            q,
            source: 'auto',
          },
          cfg,
        );
        lastReview.set(item.key, day);
        flagged.delete(item.key);
      }
      if (plan.newAllowed && st.pos < seq.length) {
        const portion = nextPortion(meta, seq, st.pos, r.pagesPerDay * factor)!;
        for (const part of partsOverlapping(parts, portion.start, portion.end)) {
          if (st.parts.get(part.key)!.learnedDay === null) lastReview.set(part.key, day);
          apply(
            st,
            {
              day,
              id: String(n++).padStart(10, '0'),
              part: part.key,
              kind: 'appris',
              source: 'auto',
              pos: portion.end,
            },
            cfg,
          );
        }
        st.pos = portion.end;
      }
    }
    // proposé ce jour (roue) ou signalé en dette, et pas fait : l'attente n'est pas une faute de l'algorithme
    for (const o of [...plan.manzil, ...plan.overdue])
      if (lastReview.get(o.key) !== day) flagged.add(o.key);
    const end = planDay(st, day, cfg);
    closeDay(st, end);
    if (end.proposeRelief && day >= reliefUntil) {
      reliefUntil = day + 7;
      reliefs++;
    }
    if (finished < 0 && st.pos >= seq.length) finished = day;
    if (finished >= 0 && day > finished) break;
  }
  // ≈ 3 mois de jours travaillés
  const q = Math.max(1, Math.round(91 * prof.regularity));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    years,
    cycle,
    yearsToFinish: finished < 0 ? null : Math.round((finished / 365) * 10) / 10,
    startMinutes: Math.round(avg(minutes.slice(0, q))),
    endMinutes: Math.round(avg(minutes.slice(-q))),
    maxGap,
    violations,
    budgetExceeded,
    reliefs,
  };
}
