import { describe, expect, it } from 'vitest';
import { analyze, evaluate, startPoint, type Mask, type Point } from './evaluate';
import { formText, LETTERS, letterModel } from './letters';

/** Lettre synthétique « ب » : un corps couché et un point dessous. */
function ba(): Mask {
  const w = 240;
  const h = 200;
  const data = new Uint8Array(w * h);
  const fill = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = 1;
  };
  fill(40, 200, 100, 110);
  fill(190, 200, 80, 110); // la petite remontée à droite
  fill(118, 126, 130, 138); // le point dessous
  return { w, h, data };
}

const line = (x0: number, y0: number, x1: number, y1: number, n = 40): Point[] =>
  Array.from({ length: n + 1 }, (_, k) => ({
    x: x0 + ((x1 - x0) * k) / n,
    y: y0 + ((y1 - y0) * k) / n,
  }));
const OPT = { tol: 10, start: 'droite' as const, strict: true };

describe('tracé guidé : vérifications simples, sans note', () => {
  const g = analyze(ba());

  it('corps et signes séparés', () => {
    expect(g.body).toHaveLength(1);
    expect(g.marks).toHaveLength(1);
    expect(g.marks[0]!.cy).toBeGreaterThan(g.box.cy);
    const s = startPoint(g, 'droite')!;
    expect(s.x).toBeGreaterThan(190);
  });

  it('bon tracé : de droite à gauche, puis le point', () => {
    const body = [...line(195, 82, 195, 105, 10), ...line(195, 105, 45, 105)];
    expect(
      evaluate(
        g,
        [
          body,
          [
            { x: 122, y: 134 },
            { x: 122, y: 135 },
          ],
        ],
        OPT,
      ),
    ).toEqual({ ok: true });
  });

  it('départ à gauche : « recommence en partant de la droite »', () => {
    const body = line(45, 105, 195, 105);
    expect(
      evaluate(
        g,
        [
          body,
          [
            { x: 122, y: 134 },
            { x: 122, y: 135 },
          ],
        ],
        OPT,
      ).reason,
    ).toBe('depart');
  });

  it('point oublié : combien et où', () => {
    const body = line(195, 105, 45, 105);
    expect(evaluate(g, [body], OPT)).toEqual({
      ok: false,
      reason: 'points',
      missing: { n: 1, pos: 'bas' },
    });
  });

  it('point posé avant le corps : ordre', () => {
    const body = line(195, 105, 45, 105);
    expect(
      evaluate(
        g,
        [
          [
            { x: 122, y: 134 },
            { x: 122, y: 135 },
          ],
          body,
        ],
        OPT,
      ).reason,
    ).toBe('ordre');
  });

  it('hors du couloir, tracé trop court, vide', () => {
    expect(evaluate(g, [line(10, 10, 230, 190)], OPT).reason).toBe('couloir');
    expect(evaluate(g, [line(195, 105, 160, 105)], OPT).reason).toBe('incomplet');
    expect(evaluate(g, [], OPT).reason).toBe('vide');
  });

  it('mot : couloir et couverture seulement', () => {
    expect(evaluate(g, [line(45, 105, 195, 105)], { ...OPT, strict: false }).ok).toBe(true);
  });
});

describe('lettres', () => {
  it('28 lettres et lām-alif ; formes des lettres qui ne se lient pas', () => {
    expect(LETTERS).toHaveLength(29);
    expect(letterModel('د')!.forms).toEqual(['isolee', 'fin']);
    expect(letterModel('ب')!.forms).toHaveLength(4);
    expect(formText('ب', 'milieu')).toBe('‍ب‍');
    expect(formText('ب', 'isolee')).toBe('ب');
  });
});
