import { describe, expect, it } from 'vitest';
import {
  addDays,
  fromLeitner,
  initDifficulty,
  initStability,
  interval,
  retrievability,
  review,
  W,
  type CardState,
} from './fsrs';

describe('FSRS-5', () => {
  it('paramètres publiés et formules de base', () => {
    expect(W).toHaveLength(19);
    // rappel de 90 % quand t = S (définition de la stabilité)
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 10);
    expect(retrievability(0, 3)).toBe(1);
    // à 90 % de rétention, l'intervalle vaut la stabilité (arrondie, 1 à 365 jours)
    expect(interval(7.4)).toBe(7);
    expect(interval(0.2)).toBe(1);
    expect(interval(5000)).toBe(365);
    expect(initStability(3)).toBeCloseTo(3.173, 5);
    expect(initDifficulty(1)).toBeGreaterThan(initDifficulty(3));
    expect(initDifficulty(4)).toBeGreaterThanOrEqual(1);
  });

  it('première réponse : « je savais » → 3 jours ; « à revoir » → demain', () => {
    const d = '2026-09-29';
    expect(review(undefined, 3, d)).toMatchObject({ due: '2026-10-02', reps: 1, lapses: 0 });
    expect(review(undefined, 1, d)).toMatchObject({ due: '2026-09-30', reps: 1, lapses: 1 });
  });

  it('succès à l’échéance : l’intervalle grandit ; oubli : stabilité réduite, revue le lendemain', () => {
    let st: CardState = review(undefined, 3, '2026-09-29');
    const intervals: number[] = [];
    for (let k = 0; k < 5; k++) {
      const today = st.due;
      const prev = st;
      st = review(st, 3, today);
      intervals.push(Math.round((Date.parse(st.due) - Date.parse(today)) / 86_400_000));
      expect(st.s).toBeGreaterThan(prev.s);
    }
    for (let k = 1; k < intervals.length; k++)
      expect(intervals[k]!).toBeGreaterThan(intervals[k - 1]!);
    const before = st;
    st = review(st, 1, st.due);
    expect(st.s).toBeLessThan(before.s);
    expect(st.d).toBeGreaterThan(before.d);
    expect(st.due).toBe(addDays(before.due, 1));
    expect(st.lapses).toBe(1);
  });

  it('révision en retard réussie : stabilité plus forte qu’à l’échéance', () => {
    const base = review(undefined, 3, '2026-09-01');
    const onTime = review(base, 3, base.due);
    const late = review(base, 3, addDays(base.due, 10));
    expect(late.s).toBeGreaterThan(onTime.s);
  });

  it('migration Leitner : boîte → stabilité = intervalle, échéance conservée', () => {
    const m = fromLeitner({ box: 5, due: '2026-10-20' });
    expect(m).toMatchObject({ s: 16, due: '2026-10-20', last: '2026-10-04', lapses: 0 });
    expect(fromLeitner({ box: 9, due: '2026-10-20' }).s).toBe(16);
  });

  it('audit MET-4 : migration Leitner robuste — boîte non entière, date invalide, sans exception', () => {
    expect(fromLeitner({ box: 2.5, due: '2026-10-20' }).s).toBe(4);
    expect(fromLeitner({ box: Number.NaN, due: '2026-10-20' }).s).toBe(1);
    const bad = fromLeitner({ box: 3, due: 'pas une date' });
    expect(bad.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bad.last).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
