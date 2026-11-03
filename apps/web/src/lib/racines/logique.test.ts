import { describe, expect, it } from 'vitest';
import {
  auDessus,
  decoupeVerset,
  pastille,
  plagesRacine,
  questions,
  segments,
  visible,
  type Famille,
  type Index,
  type Mot,
} from './logique';

const mot = (n: number, s: string, extra: Partial<Mot> = {}): Mot => ({
  n,
  f: 'عَلِمَ',
  e: 'le verbe',
  m: 'فَعِلَ',
  ml: [
    [0, 2],
    [2, 4],
    [4, 6],
  ],
  me: 'x',
  s,
  fr: 10,
  na: 1,
  rl: [
    [0, 2, 'visible'],
    [2, 4, 'visible'],
    [4, 6, 'visible'],
  ],
  ln: [],
  x: { t: 'كَلَّا سَيَعْلَمُونَ', r: '78:4', i: 7, l: 'سَيَعْلَمُونَ'.length },
  ...extra,
});
const idx: Index = {
  p: 'adulte',
  total: 1000,
  f: Array.from({ length: 12 }, (_, k) => ({
    i: k + 1,
    r: `ا ب ${k}`,
    s: `idée ${k}`,
    n: 1 + (k % 4),
    e: 0 as const,
    a: { f: 'ف', s: `sens ${k}` },
    w: [
      [k * 10 + 1, 5],
      [k * 10 + 2, 15],
    ] as Array<[number, number]>,
  })),
};
const fam: Famille = {
  i: 3,
  r: 'ع ل م',
  s: 'savoir',
  n: 1,
  a: 1,
  o: [1, 2],
  mots: [mot(1, 'savoir'), mot(2, 'très savant', { na: 3 })],
};

describe('segments', () => {
  it('colore les plages (indices UTF-16, voyelles comprises) et rassemble les morceaux', () => {
    const s = segments('عَلِمَ', [
      [0, 2],
      [4, 6],
    ]);
    expect(s.map((x) => x.t).join('')).toBe('عَلِمَ');
    expect(s.filter((x) => x.r).map((x) => x.t)).toEqual(['عَ', 'مَ']);
  });
  it('lettre absente : rien n’est coloré', () => {
    const m = mot(9, 'x', {
      rl: [
        [0, 2, 'visible'],
        [-1, -1, 'absente'],
      ],
    });
    expect(plagesRacine(m)).toEqual([[0, 2, 'visible']]);
  });
});
describe('verset', () => {
  it('le mot étudié est la tranche du texte, sans rien changer au texte', () => {
    const d = decoupeVerset(mot(1, 's').x);
    expect(d.avant + d.mot + d.apres).toBe('كَلَّا سَيَعْلَمُونَ');
    expect(d.mot).toBe('سَيَعْلَمُونَ');
  });
});
describe('niveaux', () => {
  it('un élève voit son niveau et en dessous ; l’enfant et le niveau inconnu : tout', () => {
    expect(visible({ n: 3 }, 3, false)).toBe(true);
    expect(visible({ n: 4 }, 3, false)).toBe(false);
    expect(visible({ n: 11 }, null, false)).toBe(true);
    expect(visible({ n: 11 }, 2, true)).toBe(true);
  });
  it('un mot au-dessus du niveau est signalé', () => {
    expect(auDessus(mot(2, 's', { na: 3 }), 2, fam)).toBe(true);
    expect(auDessus(mot(2, 's', { na: 3 }), 3, fam)).toBe(false);
    expect(auDessus(mot(2, 's', { na: 3 }), null, fam)).toBe(true);
  });
});
describe('pastille', () => {
  it('gain = fréquences des mots non connus / total du Coran', () => {
    const e = idx.f[2]!;
    const p = pastille(idx, e, new Set([e.w[0]![0]]));
    expect(p.gain).toBeCloseTo((100 * 15) / 1000);
    expect(p.apres).toBeCloseTo(p.avant + p.gain);
    expect(pastille(idx, e, new Set(e.w.map(([n]) => n))).gain).toBe(0);
  });
});
describe('mini-exercice', () => {
  it('2 questions, 3 choix, la bonne réponse y figure, sans doublon, déterministe', () => {
    const q = questions(fam, idx, fam.mots);
    expect(q).toHaveLength(2);
    for (const x of q) {
      expect(x.choix).toHaveLength(3);
      expect(new Set(x.choix).size).toBe(3);
    }
    expect(q[0]!.choix[q[0]!.bon]).toBe('ع ل م');
    expect(q[1]!.choix[q[1]!.bon]).toBe('très savant');
    expect(questions(fam, idx, fam.mots)).toEqual(q);
  });
});
