import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dueWords, isYoung, levelOf, migrateBoxes, type Word } from './cards';
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

describe('cartes de mots (FSRS)', () => {
  it('ancien état Leitner converti sans perte d’échéance', () => {
    const { boxes, migrated } = migrateBoxes({
      a: { box: 3, due: '2026-10-03' },
      b: { s: 5, d: 5, last: '2026-09-28', due: '2026-10-03', reps: 2, lapses: 0 },
      bad: 42,
    });
    expect(migrated).toBe(1);
    expect(boxes.a).toMatchObject({ s: 4, due: '2026-10-03', last: '2026-09-29' });
    expect(boxes.b!.s).toBe(5);
    expect(boxes.bad).toBeUndefined();
  });
  it('cartes du jour : nouvelles ou échues, au plus 12', () => {
    const words = ['a', 'b', 'c'].map(W);
    const st = (due: string) => ({ s: 2, d: 5, last: '2026-09-27', due, reps: 1, lapses: 0 });
    const boxes = { a: st('2026-10-05'), b: st('2026-09-29') };
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
