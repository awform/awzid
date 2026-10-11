import { describe, expect, it } from 'vitest';
import { grouperUnites } from './unites';

const L = (n: number, statut: string | null = null) => ({
  id: `x.l${n}`,
  kind: 'lecon' as const,
  numLecon: n,
  n,
  statut,
});
const B = (n: number) => ({
  id: `x.b${n}`,
  kind: 'bilan' as const,
  numLecon: null,
  n: 100 + n,
  statut: null,
});
const E = { id: 'x.ex', kind: 'examen' as const, numLecon: null, n: 200, statut: null };

describe('D1 — leçons groupées par unité', () => {
  it('une unité va jusqu’à son bilan ; l’examen ferme la dernière ; ordre du livre conservé', () => {
    const u = [L(1, 'terminee'), L(2), B(1), L(3), L(4), B(2), E];
    const g = grouperUnites(u, ({ de, a }) => `${de}-${a}`);
    expect(g.map((x) => x.lecons.map((y) => y.id))).toEqual([
      ['x.l1', 'x.l2', 'x.b1'],
      ['x.l3', 'x.l4', 'x.b2', 'x.ex'],
    ]);
    expect(g.flatMap((x) => x.lecons)).toEqual(u);
    expect(g[0]!.faites).toBe(1);
    expect(g.map((x) => x.libelle)).toEqual(['1-2', '3-4']);
  });
  it('leçons après le dernier bilan : une unité de plus', () => {
    const g = grouperUnites([L(1), B(1), L(2), E], ({ de, a }) => `${de}-${a}`);
    expect(g).toHaveLength(2);
    expect(g[1]!.lecons.map((x) => x.id)).toEqual(['x.l2', 'x.ex']);
  });
});
