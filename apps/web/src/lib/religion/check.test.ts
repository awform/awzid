import { describe, expect, it } from 'vitest';
import { calculOk, holes, orderOk, qcmOk, shuffle } from './check';

describe('exercices de religion : correction sur l’appareil', () => {
  it('QCM et cas : indice ou texte de l’option', () => {
    expect(qcmOk({ options: ['Allah', 'Le docteur'], reponse: 'Allah' }, 0)).toBe(true);
    expect(qcmOk({ options: ['a', 'b', 'c'], reponse: 1 }, 1)).toBe(true);
    expect(qcmOk({ options: ['a', 'b', 'c'], reponse: 1 }, 2)).toBe(false);
  });
  it('ordre : étapes (ordre du livre) et frise (rangs)', () => {
    expect(orderOk([{}, {}, {}], [0, 1, 2])).toBe(true);
    expect(orderOk([{}, {}, {}], [1, 0, 2])).toBe(false);
    expect(orderOk([{ rang: 2 }, { rang: 1 }], [1, 0])).toBe(true);
    expect(orderOk([{}, {}], [0])).toBe(false);
  });
  it('calcul : tolérance, virgule française, espaces', () => {
    expect(calculOk({ reponse: 10, tolerance: 0 }, '10')).toBe(true);
    expect(calculOk({ reponse: 5000 }, '5 000')).toBe(true);
    expect(calculOk({ reponse: 7.5, tolerance: 0.1 }, '7,45')).toBe(true);
    expect(calculOk({ reponse: 10 }, 'dix')).toBe(false);
  });
  it('trous et mélange', () => {
    expect(holes('Allah m’___ quand je parle. Allah me ___.')).toHaveLength(3);
    const xs = [1, 2, 3, 4];
    const s = shuffle(xs);
    expect([...s].sort()).toEqual(xs);
    expect(s).not.toEqual(xs);
  });
});
