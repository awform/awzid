import { describe, expect, it } from 'vitest';
import {
  apply,
  cycleFor,
  forecast,
  suggestRhythm,
  trialStats,
  MANZIL,
  newState,
  note,
  planDay,
  qualityOf,
  replay,
  type EngineConfig,
  type HifzEvent,
  type Quality,
} from '../src/index.js';

const CFG: EngineConfig = { dailyMinutes: 30, newMinutes: 6 };
let n = 0;
const ev = (
  day: number,
  part: string,
  kind: HifzEvent['kind'],
  q?: Quality,
  source: HifzEvent['source'] = 'auto',
): HifzEvent => ({
  day,
  id: String(n++).padStart(8, '0'),
  part,
  kind,
  q,
  source,
});

describe('révision récente J+1, J+2, J+3, J+7, J+14, J+30 puis roue', () => {
  it('échéances du carnet, une seule avancée par jour', () => {
    const st = newState([{ key: 'A', pages: 1 }]);
    apply(st, ev(100, 'A', 'appris'), CFG);
    const A = st.parts.get('A')!;
    const dues: number[] = [A.due];
    for (const d of [101, 102, 103, 107, 114]) {
      apply(st, ev(d, 'A', 'revision', 3), CFG);
      apply(st, ev(d, 'A', 'revision', 3, 'parent'), CFG); // 2e révision le même jour : pas d’avancée
      dues.push(A.due);
    }
    expect(dues).toEqual([101, 102, 103, 107, 114, 130]);
    apply(st, ev(130, 'A', 'revision', 3), CFG);
    expect(A.stage).toBe(MANZIL);
    expect(A.due).toBeGreaterThan(130);
    expect(A.due - 130).toBeLessThanOrEqual(30);
  });

  it('règle d’arrêt : plusieurs aides à J+3 ou J+7 → pas de nouveau le lendemain', () => {
    const st = newState([{ key: 'A', pages: 0.5 }]);
    apply(st, ev(10, 'A', 'appris'), CFG);
    apply(st, ev(11, 'A', 'revision', 3), CFG);
    apply(st, ev(12, 'A', 'revision', 3), CFG);
    apply(st, ev(13, 'A', 'revision', 0), CFG); // J+3 : à reprendre
    expect(planDay(st, 14, CFG).newAllowed).toBe(false);
    expect(planDay(st, 14, CFG).stopRule).toBe(true);
    expect(st.parts.get('A')!.due).toBe(14); // reprise dès le lendemain
    expect(planDay(st, 15, CFG).newAllowed).toBe(true);
  });

  it('la source compte : le maître pèse plus que l’auto-évaluation', () => {
    const a = newState([{ key: 'A', pages: 1 }]);
    const b = newState([{ key: 'A', pages: 1 }]);
    for (const st of [a, b]) apply(st, ev(1, 'A', 'appris'), CFG);
    apply(a, ev(2, 'A', 'revision', 3, 'auto'), CFG);
    apply(b, ev(2, 'A', 'revision', 3, 'enseignant'), CFG);
    expect(b.parts.get('A')!.S).toBeGreaterThan(a.parts.get('A')!.S);
  });

  it('roue plafonnée au budget, parts fragiles d’abord, dette signalée', () => {
    const parts = Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, pages: 1 }));
    const st = newState(parts);
    // tout l’acquis dans la roue, échu aujourd’hui ; p5 fragile
    for (const p of st.parts.values()) {
      p.learnedDay = 0;
      p.stage = MANZIL;
      p.due = 50;
      p.S = p.key === 'p5' ? 0.2 : 0.8;
    }
    const plan = planDay(st, 50, CFG);
    expect(plan.manzil[0]!.key).toBe('p5');
    expect(plan.minutes.manzil).toBeLessThanOrEqual(plan.budget);
    expect(plan.overdue.length).toBeGreaterThan(0);
    expect(plan.debtMinutes).toBeGreaterThan(0);
    expect(cycleFor(1)).toBe(3);
    expect(cycleFor(604)).toBe(30);
  });

  it('rejeu du journal : même résultat quel que soit l’ordre d’arrivée', () => {
    const events = [ev(1, 'A', 'appris'), ev(2, 'A', 'revision', 3), ev(3, 'A', 'revision', 2)];
    const a = replay([{ key: 'A', pages: 1 }], events, 5, CFG);
    const b = replay([{ key: 'A', pages: 1 }], [...events].reverse(), 5, CFG);
    expect(a.state.parts.get('A')).toEqual(b.state.parts.get('A'));
  });
});

describe('barème du maître', () => {
  it('note /20, mentions, règle du verset oublié deux fois', () => {
    const z = {
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 4,
    };
    expect(note(z)).toMatchObject({ total: 20, mention: 'excellent', validation: 'oui' });
    const n1 = note({ ...z, aides: 2, hesitations: 1, discretes: 2, fluidite: 3 });
    expect(n1.total).toBe(20 - 2 - 0.5 - 1 - 1);
    expect(n1.mention).toBe('bien');
    expect(qualityOf(n1)).toBe(2);
    const n2 = note({ ...z, oublis: 2 });
    expect(n2.total).toBe(16);
    expect(n2.mention).toBe('a_reprendre');
    expect(qualityOf(n2)).toBe(0);
    expect(note({ ...z, aides: 30, claires: 30, fluidite: 9 })).toMatchObject({
      memorisation: 0,
      tajwid: 0,
      fluidite: 4,
    });
    expect(note({ ...z, aides: 5, hesitations: 2, fluidite: 3 }).validation).toBe('provisoire');
  });
});

describe('mois d’essai et prévisions', () => {
  it('rythme proposé d’après la rétention mesurée, jamais plus rapide sans preuves', () => {
    const evs: HifzEvent[] = [];
    for (let d = 0; d < 28; d++) evs.push(ev(d, 'A', 'revision', 3));
    const s = trialStats(evs, 0, 28);
    expect(s.retention).toBe(1);
    expect(s.regularity).toBe(1);
    expect(suggestRhythm(s)).toBe(5);
    expect(suggestRhythm(trialStats([], 0, 28))).toBe(7);
    const weak = evs.map((e, i) => ({ ...e, q: (i % 2 ? 3 : 1) as Quality }));
    expect(suggestRhythm(trialStats(weak, 0, 28))).toBe(7);
  });
  it('prévision honnête : la révision de fin de parcours dépasse le temps du rythme « 7 ans »', () => {
    const f = forecast(7);
    expect(f.workDays).toBe(1510);
    expect(f.finalRevisionMinutes).toBe(60);
    expect(f.finalSessionMinutes).toBeGreaterThan(f.minutes[1]);
  });
});
