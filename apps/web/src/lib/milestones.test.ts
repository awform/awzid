import { describe, expect, it } from 'vitest';
import { completeHizb, completeJuz, completeQuarters, completeSuras } from './milestones';

/** Nombres de versets des 114 sourates (Ḥafṣ), pour le test uniquement. */
const COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];
const range = (s: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${s}:${from + i}`);
/** Les 8 derniers quarts de ḥizb (juzʾ 30), tels que dans les métadonnées Tanzil. */
const LAST_QUARTERS: Array<readonly [number, number]> = [
  [78, 1],
  [80, 1],
  [82, 1],
  [84, 1],
  [87, 1],
  [90, 1],
  [94, 1],
  [100, 9],
];

describe('jalons de maîtrise', () => {
  it('sourate complète seulement si tous ses versets sont acquis', () => {
    const acquis = new Set([...range(112, 1, 4), ...range(113, 1, 4)]);
    expect(completeSuras(acquis, COUNTS)).toEqual([112]);
  });
  it('juzʾ ʿAmma (78 → 114) complet', () => {
    const acquis = new Set<string>();
    for (let s = 78; s <= 114; s++) for (const k of range(s, 1, COUNTS[s - 1]!)) acquis.add(k);
    expect(completeJuz(acquis, COUNTS)).toEqual([30]);
    acquis.delete('114:6');
    expect(completeJuz(acquis, COUNTS)).toEqual([]);
  });
  it('ḥizb et quarts de ḥizb sur les bornes officielles', () => {
    const acquis = new Set<string>();
    for (let s = 94; s <= 114; s++) for (const k of range(s, 1, COUNTS[s - 1]!)) acquis.add(k);
    // du quart 7 (94:1) à la fin : deux quarts complets (7 et 8), aucun ḥizb (le 2e commence en 87:1)
    expect(completeQuarters(acquis, COUNTS, LAST_QUARTERS)).toEqual([7, 8]);
    expect(completeHizb(acquis, COUNTS, LAST_QUARTERS)).toEqual([]);
    for (let s = 87; s <= 93; s++) for (const k of range(s, 1, COUNTS[s - 1]!)) acquis.add(k);
    expect(completeHizb(acquis, COUNTS, LAST_QUARTERS)).toEqual([2]);
  });
  it('le total des versets est 6 236', () => {
    expect(COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
  });
});
