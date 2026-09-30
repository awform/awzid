import { describe, expect, it } from 'vitest';
import type { HifzBookData } from '../src/book.js';
import {
  coranNote15,
  drawRecital,
  drawWithout,
  recitalChoices,
  recitalPool,
} from '../src/recital.js';

const e = (sourate: number, versets: string) => ({ sourate, versets, portions: [] });
const BOOK: HifzBookData = {
  code: 'xx1',
  semaines: 30,
  parcours: {
    socle: [e(114, '1-6'), e(113, '1-5'), e(112, '1-4'), e(111, '1-5'), e(112, '1-4')],
    renforce: [e(110, '1-3'), e(112, '1-4')],
  },
};
/** tirage déterministe : toujours le premier élément restant */
const first = () => 0;

describe('récital de hifẓ', () => {
  it('recitalPool / recitalChoices : passages du carnet, sans doublon', () => {
    expect(recitalPool(BOOK, 'socle')).toEqual(['114:1-6', '113:1-5', '112:1-4', '111:1-5']);
    expect(recitalPool(BOOK, 'renforce')).toEqual(['110:1-3', '112:1-4']);
    expect(recitalChoices(BOOK, 'socle')).toHaveLength(4);
    expect(recitalChoices(BOOK, 'renforce')).toEqual([
      '114:1-6',
      '113:1-5',
      '112:1-4',
      '111:1-5',
      '110:1-3',
    ]);
    expect(recitalPool({ ...BOOK, parcours: { socle: [] } }, 'renforce')).toEqual([]);
  });

  it('drawWithout : sans remise, borné par la taille', () => {
    expect(drawWithout([1, 2, 3], 2, first)).toEqual([1, 2]);
    expect(drawWithout([1, 2, 3], 2, (k) => k - 1)).toEqual([3, 2]);
    expect(drawWithout([1], 3, first)).toEqual([1]);
    for (let i = 0; i < 50; i++) {
      const d = drawWithout([1, 2, 3, 4, 5], 3, (k) => Math.floor(Math.random() * k));
      expect(new Set(d).size).toBe(3);
    }
  });

  it('drawRecital : 3 du socle, + 1 du renforcé jamais déjà tiré', () => {
    expect(drawRecital(BOOK, 'socle', first)).toEqual(['114:1-6', '113:1-5', '112:1-4']);
    // 112:1-4 déjà tiré dans le socle : le passage renforcé est 110:1-3
    expect(drawRecital(BOOK, 'renforce', first)).toEqual([
      '114:1-6',
      '113:1-5',
      '112:1-4',
      '110:1-3',
    ]);
    const small: HifzBookData = { ...BOOK, parcours: { socle: [e(1, '1-7')] } };
    expect(drawRecital(small, 'renforce', first)).toEqual(['1:1-7']);
  });

  it('coranNote15 : récital × 0,75, au quart de point, borné', () => {
    expect(coranNote15(20)).toBe(15);
    expect(coranNote15(16)).toBe(12);
    expect(coranNote15(17.5)).toBe(13.25);
    expect(coranNote15(13.5)).toBe(10.25); // 10,125 → 10,25
    expect(coranNote15(-3)).toBe(0);
    expect(coranNote15(40)).toBe(15);
  });
});
