import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addDays, dueWords, isYoung, levelOf, nextBox, type Word } from './cards';
import type { ProfileInfo } from './session';

const W = (ar: string): Word => ({ ar, fr: ar, unit: 'en1.l01' });
const P = (over: Partial<ProfileInfo>): ProfileInfo => ({
  id: 'x',
  kind: 'enfant',
  pseudonym: 'A',
  birthYear: 2019,
  avatar: null,
  levelCode: 'en1',
  ...over,
});

describe('cartes de mots (boîtes de Leitner)', () => {
  it('su : boîte suivante, 1, 2, 4, 8, 16 jours ; à revoir : boîte 1, demain', () => {
    const d = '2026-09-29';
    expect(nextBox(undefined, true, d)).toEqual({ box: 1, due: '2026-09-30' });
    expect(nextBox({ box: 1 }, true, d)).toEqual({ box: 2, due: '2026-10-01' });
    expect(nextBox({ box: 4 }, true, d)).toEqual({ box: 5, due: addDays(d, 16) });
    expect(nextBox({ box: 5 }, true, d).box).toBe(5);
    expect(nextBox({ box: 4 }, false, d)).toEqual({ box: 1, due: '2026-09-30' });
  });
  it('cartes du jour : nouvelles ou échues, au plus 12', () => {
    const words = ['a', 'b', 'c'].map(W);
    const boxes = { a: { box: 2, due: '2026-10-05' }, b: { box: 1, due: '2026-09-29' } };
    expect(dueWords(words, boxes, '2026-09-29').map((w) => w.ar)).toEqual(['b', 'c']);
    expect(
      dueWords(
        Array.from({ length: 30 }, (_, i) => W(String(i))),
        {},
        '2026-09-29',
      ),
    ).toHaveLength(12);
  });
  it('petits (E1, E2) : mini-jeu ; grands et adultes : cartes', () => {
    expect(isYoung(P({}))).toBe(true);
    expect(isYoung(P({ levelCode: 'en3' }))).toBe(false);
    expect(isYoung(P({ kind: 'adulte', levelCode: null }))).toBe(false);
    expect(levelOf(P({ kind: 'adulte', levelCode: null }))).toBe('ad1');
  });
});
