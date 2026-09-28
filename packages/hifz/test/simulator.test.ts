/**
 * Simulateur (ARCHITECTURE_V2 § 2.3, « Tests ») : élèves virtuels suivis jusqu'à 10 ans au rythme choisi.
 * Vérifie : révision ancienne toujours dans le budget ; aucune part n'attend plus de 30 jours SANS que la
 * dette ait été signalée ; règle d'arrêt appliquée ; le Coran entier est parcouru ; la charge est mesurée.
 */
import { describe, expect, it } from 'vitest';
import {
  acquiredPages,
  apply,
  cycleFor,
  buildParts,
  closeDay,
  dailyMinutes,
  learningSequence,
  MANZIL,
  newState,
  nextPortion,
  partsOverlapping,
  planDay,
  rhythm,
  type EngineConfig,
  type Quality,
} from '../src/index.js';
import { syntheticMeta } from './helpers.js';

interface Profile {
  name: string;
  /** probabilité d'oubli de base */
  forget: number;
  /** part des jours travaillés (220 / 365 ≈ 0,6) */
  regularity: number;
}

function simulate(years: 3 | 4 | 5 | 6 | 7, prof: Profile, seed = 1, grow = true) {
  const meta = syntheticMeta();
  const seq = learningSequence(meta, 'rebours');
  const parts = buildParts(meta, seq);
  const r = rhythm(years);
  const cfg: EngineConfig = { dailyMinutes: dailyMinutes(r), newMinutes: r.pagesPerDay * 15 };
  const st = newState(parts);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const lastReview = new Map<string, number>();
  const flagged = new Set<string>();
  let n = 0;
  let reliefUntil = -1;
  let reliefs = 0;
  let violations = 0;
  let budgetExceeded = 0;
  let stopRuleBroken = 0;
  let maxManzilMinutes = 0;
  let finished = -1;
  const LIMIT = 365 * 10;
  const base = cfg.dailyMinutes;
  for (let day = 0; day < LIMIT; day++) {
    // temps d'une séance : la révision de l'acquis grandit (tour ≤ 30 jours, 3 min par page),
    // et se concentre sur les jours travaillés
    if (grow) {
      const acq = acquiredPages(st);
      cfg.dailyMinutes = Math.max(
        base,
        ((acq / cycleFor(acq)) * 3) / prof.regularity + cfg.newMinutes + 5,
      );
    }
    const plan = planDay(st, day, cfg);
    const maxPart = Math.max(0, ...plan.manzil.map((m) => m.minutes));
    if (plan.minutes.manzil > plan.budget + maxPart) budgetExceeded++;
    maxManzilMinutes = Math.max(maxManzilMinutes, plan.minutes.manzil);
    if (rnd() < prof.regularity) {
      for (const item of [...plan.recent, ...plan.manzil]) {
        const p = st.parts.get(item.key)!;
        if (p.stage >= MANZIL) {
          const gap = day - (lastReview.get(item.key) ?? day);
          if (gap > 30 && !flagged.has(item.key)) violations++;
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
        const factor = day < reliefUntil ? 0.5 : 1;
        const portion = nextPortion(meta, seq, st.pos, r.pagesPerDay * factor)!;
        for (const part of partsOverlapping(parts, portion.start, portion.end)) {
          const ps = st.parts.get(part.key)!;
          if (ps.learnedDay === null) lastReview.set(part.key, day);
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
      } else if (!plan.newAllowed && st.pos < seq.length && plan.stopRule === false)
        stopRuleBroken++;
    }
    // proposé ce jour (roue) ou signalé en dette, et pas fait (élève absent, budget plein) :
    // une attente de plus de 30 jours n'est alors pas une faute de l'algorithme
    for (const o of [...plan.manzil, ...plan.overdue])
      if (lastReview.get(o.key) !== day) flagged.add(o.key);
    const end = planDay(st, day, cfg);
    closeDay(st, end);
    if (end.proposeRelief && day >= reliefUntil) {
      // l'enseignant accepte la proposition : nouveau réduit de moitié pendant une semaine
      reliefUntil = day + 7;
      reliefs++;
    }
    if (finished < 0 && st.pos >= seq.length) finished = day;
  }
  return {
    yearsToFinish: finished < 0 ? null : finished / 365,
    violations,
    budgetExceeded,
    stopRuleBroken,
    reliefs,
    maxManzilMinutes,
    cfg,
  };
}

const PROFILES: Profile[] = [
  { name: 'régulier', forget: 0.05, regularity: 0.62 },
  { name: 'oublie souvent', forget: 0.25, regularity: 0.62 },
  { name: 'irrégulier', forget: 0.1, regularity: 0.45 },
];

describe('simulateur du hifẓ complet', () => {
  it('à temps constant (7 ans, 52 min) : la dette est signalée, des allègements sont PROPOSÉS', () => {
    const r = simulate(7, PROFILES[0]!, 3, false);
    expect(r.violations).toBe(0);
    expect(r.budgetExceeded).toBe(0);
    expect(r.reliefs).toBeGreaterThan(0);
  });

  for (const years of [7, 5, 3] as const)
    for (const prof of PROFILES)
      it(`${years} ans — élève ${prof.name}`, () => {
        const r = simulate(years, prof, years * 31 + prof.name.length);
        // révision ancienne dans le budget (au plus une part au-delà, jamais zéro révision)
        expect(r.budgetExceeded).toBe(0);
        // aucune part n'attend plus de 30 jours sans que la dette ait été signalée
        expect(r.violations).toBe(0);
        expect(r.stopRuleBroken).toBe(0);
        // le Coran entier est parcouru en 10 ans au plus, et pas plus vite que le rythme
        expect(r.yearsToFinish, JSON.stringify(r)).not.toBeNull();
        expect(r.yearsToFinish!).toBeGreaterThan(years * 0.8);
        if (prof.name === 'régulier') expect(r.yearsToFinish!).toBeLessThan(years * 1.35);
      });
});
