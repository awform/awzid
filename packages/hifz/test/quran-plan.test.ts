import { describe, expect, it } from 'vitest';
import {
  allPortions,
  buildMeta,
  buildParts,
  JUZ_STARTS,
  juzOf,
  learningSequence,
  letterCount,
  pagesOf,
  RHYTHMS,
  splitBasmala,
  suraOrder,
  SURA_NAMES,
  WORK_DAYS_PER_YEAR,
} from '../src/index.js';
import { HAS_TANZIL, loadTanzil, syntheticMeta } from './helpers.js';

describe('repères du Muṣḥaf', () => {
  it('114 noms, 30 débuts de partie croissants', () => {
    expect(SURA_NAMES).toHaveLength(114);
    expect(JUZ_STARTS).toHaveLength(30);
    for (let i = 1; i < 30; i++) {
      const [s0, a0] = JUZ_STARTS[i - 1]!;
      const [s1, a1] = JUZ_STARTS[i]!;
      expect(s1 > s0 || (s1 === s0 && a1 > a0)).toBe(true);
    }
    expect(juzOf(1, 1)).toBe(1);
    expect(juzOf(2, 141)).toBe(1);
    expect(juzOf(2, 142)).toBe(2);
    expect(juzOf(78, 1)).toBe(30);
    expect(juzOf(114, 6)).toBe(30);
  });

  it('lettres de base seulement (pas de voyelles ni de signes)', () => {
    expect(letterCount('قُلْ هُوَ ٱللَّهُ أَحَدٌ')).toBe(11);
  });

  it('ordres des sourates : chaque sourate une fois, Al-Fātiḥa d’abord', () => {
    for (const o of ['rebours', 'juz30'] as const) {
      const ord = suraOrder(o);
      expect(ord[0]).toBe(1);
      expect(new Set(ord).size).toBe(114);
    }
    expect(suraOrder('rebours').slice(0, 3)).toEqual([1, 114, 113]);
    expect(suraOrder('juz30').slice(37, 40)).toEqual([78, 77, 76]);
    expect(suraOrder('juz30')[49]).toBe(2);
  });
});

describe.skipIf(!HAS_TANZIL)('texte Tanzil (octet par octet)', () => {
  const tanzil = HAS_TANZIL ? loadTanzil() : new Map<string, string>();
  const meta = HAS_TANZIL ? buildMeta(tanzil) : syntheticMeta();

  it('6 236 versets, 114 sourates, débuts de partie présents', () => {
    expect(tanzil.size).toBe(6236);
    expect(meta.weights).toHaveLength(114);
    expect(meta.weights.reduce((s, r) => s + r.length, 0)).toBe(6236);
    for (const [s, a] of JUZ_STARTS) expect(tanzil.has(`${s}:${a}`)).toBe(true);
  });

  it('la basmala séparée pour l’affichage redonne exactement le texte Tanzil', () => {
    const bism = tanzil.get('1:1')!;
    let split = 0;
    for (let s = 1; s <= 114; s++) {
      const text = tanzil.get(`${s}:1`)!;
      const r = splitBasmala(s, 1, text, bism);
      if (r.basmala) {
        split++;
        expect(`${r.basmala} ${r.rest}`).toBe(text);
      } else expect(r.rest).toBe(text);
    }
    expect(split).toBe(112); // toutes sauf Al-Fātiḥa (la basmala est le verset 1) et At-Tawba
  });

  it('chaque rythme couvre tout le Coran dans la durée annoncée (± 15 %)', () => {
    const seq = learningSequence(meta, 'rebours');
    expect(seq).toHaveLength(6236);
    for (const r of RHYTHMS) {
      const ps = allPortions(meta, seq, r.pagesPerDay);
      expect(ps[0]!.start).toBe(0);
      for (let i = 1; i < ps.length; i++) expect(ps[i]!.start).toBe(ps[i - 1]!.end);
      expect(ps[ps.length - 1]!.end).toBe(seq.length);
      const years = ps.length / WORK_DAYS_PER_YEAR;
      expect(
        Math.abs(years - r.years) / r.years,
        `${r.years} ans : ${years.toFixed(2)}`,
      ).toBeLessThan(0.15);
      // une portion ne coupe jamais le début d’une longue sourate au milieu d’une autre
      for (const p of ps)
        if (p.segments.length > 1)
          for (const seg of p.segments.slice(0, -1))
            expect(seg.to).toBe(meta.weights[seg.s - 1]!.length);
    }
  });

  it('parts de révision ≈ 1 page, contiguës, couvrant toute la séquence', () => {
    for (const o of ['rebours', 'juz30'] as const) {
      const seq = learningSequence(meta, o);
      const parts = buildParts(meta, seq);
      expect(parts[0]!.start).toBe(0);
      expect(parts[parts.length - 1]!.end).toBe(seq.length);
      const total = parts.reduce((s, p) => s + p.pages, 0);
      expect(Math.round(total)).toBe(604);
      expect(parts.length).toBeGreaterThan(450);
      expect(parts.length).toBeLessThan(700);
      for (const p of parts) if (p.end - p.start > 1) expect(p.pages).toBeLessThan(2.2);
    }
    expect(pagesOf(meta, meta.totalWeight)).toBeCloseTo(604);
  });
});
