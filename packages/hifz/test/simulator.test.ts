/**
 * Simulateur (ARCHITECTURE_V2 § 2.3) : chaque rythme × chaque cycle de la roue (30, 45, 60 jours).
 * Vérifie : révision dans le budget ; aucune part n'attend plus que le cycle choisi SANS alerte ; le Coran
 * entier est parcouru ; la séance de fin de parcours dépend du cycle (quantité acquise), pas du rythme.
 * `SIM_TABLE=1` imprime le tableau soumis à l'école pilote (texte Tanzil réel si présent).
 */
import { describe, expect, it } from 'vitest';
import {
  buildMeta,
  CYCLES,
  defaultCycle,
  forecast,
  rhythm,
  RHYTHMS,
  simulate,
  type SimProfile,
} from '../src/index.js';
import { HAS_TANZIL, loadTanzil, syntheticMeta } from './helpers.js';

const PROFILES: SimProfile[] = [
  { name: 'régulier', forget: 0.05, regularity: 0.62 },
  { name: 'oublie souvent', forget: 0.25, regularity: 0.62 },
  { name: 'irrégulier', forget: 0.1, regularity: 0.45 },
];

describe('simulateur du hifẓ complet : rythme × cycle', () => {
  const meta = syntheticMeta();
  for (const years of [7, 5, 3] as const)
    for (const cycle of CYCLES)
      it(`${years} ans, cycle ${cycle} j`, () => {
        for (const prof of PROFILES) {
          // élève irrégulier (45 % des jours) : plus lent, mais il finit ; limite 14 ans
          const r = simulate(meta, years, cycle, prof, years * 31 + cycle + prof.name.length, 14);
          expect(r.budgetExceeded, prof.name).toBe(0);
          expect(r.violations, `${prof.name} ${JSON.stringify(r)}`).toBe(0);
          expect(r.yearsToFinish, `${prof.name} ${JSON.stringify(r)}`).not.toBeNull();
          expect(r.yearsToFinish!).toBeGreaterThan(years * 0.8);
          if (prof.name === 'régulier') expect(r.yearsToFinish!).toBeLessThan(years * 1.3);
          // la séance grandit avec l'acquis
          expect(r.endMinutes).toBeGreaterThan(r.startMinutes);
        }
      });

  it('fin de parcours : un cycle plus long allège la séance, quel que soit le rythme', () => {
    for (const r of RHYTHMS) {
      const [a, b, c] = CYCLES.map((cy) => forecast(r, cy).endMinutes);
      expect(a).toBeGreaterThan(b!);
      expect(b).toBeGreaterThan(c!);
      expect(forecast(r, 30).startMinutes).toBeLessThan(forecast(r, 30).endMinutes);
    }
    expect(defaultCycle(3)).toBe(30);
    expect(defaultCycle(4)).toBe(30);
    expect(defaultCycle(5)).toBe(45);
    expect(defaultCycle(7)).toBe(45);
    // la part de révision ancienne en fin de parcours ne dépend que du cycle
    const f3 = forecast(rhythm(3), 45);
    const f7 = forecast(rhythm(7), 45);
    expect(f3.endPagesPerDay).toBe(f7.endPagesPerDay);
  });
});

describe.skipIf(process.env.SIM_TABLE !== '1')('tableau pour l’école pilote', () => {
  it('rythme × cycle (220 jours travaillés par an)', () => {
    const meta = HAS_TANZIL ? buildMeta(loadTanzil()) : syntheticMeta();
    const lines = [
      '| Rythme | Cycle de la roue | Séance prévue (début → fin) | Séance simulée, élève régulier (début → fin) | Durée simulée : régulier / irrégulier | Allègements proposés (régulier) | Attente max d’une part (régulier) |',
      '|---|---|---|---|---|---|---|',
    ];
    for (const r of RHYTHMS)
      for (const cycle of CYCLES) {
        const f = forecast(r, cycle);
        const reg = simulate(meta, r.years, cycle, PROFILES[0]!, 7);
        const irr = simulate(meta, r.years, cycle, PROFILES[2]!, 7, 14);
        lines.push(
          `| ${r.years} ans | ${cycle} j${cycle === defaultCycle(r.years) ? ' (défaut)' : ''} | ${f.startMinutes} → ${f.endMinutes} min | ${reg.startMinutes} → ${reg.endMinutes} min | ${reg.yearsToFinish ?? '> 10'} / ${irr.yearsToFinish ?? '> 14'} ans | ${reg.reliefs} | ${reg.maxGap} j |`,
        );
      }
    console.log(`\nSIMTABLE\n${lines.join('\n')}\nFINTABLE`);
  });
});
