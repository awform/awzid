import { describe, expect, it } from 'vitest';
import {
  canHighlight,
  canMemorize,
  chainQueue,
  clampRate,
  fmtDuration,
  listenQueue,
  portionRange,
  visibleWords,
} from './player';

describe('lot 27 — logique de lecture de l’espace Coran', () => {
  it('écouter : répétition du verset et de la plage, bornée', () => {
    expect(listenQueue({ from: 1, to: 3, repeatVerse: 1, repeatRange: 1 })).toEqual([1, 2, 3]);
    expect(listenQueue({ from: 2, to: 3, repeatVerse: 2, repeatRange: 2 })).toEqual([
      2, 2, 3, 3, 2, 2, 3, 3,
    ]);
    expect(listenQueue({ from: 5, to: 2, repeatVerse: 0, repeatRange: 99 })).toHaveLength(20);
  });

  it('mémoriser : écouter le nouveau verset, puis enchaîner depuis le début', () => {
    const q = chainQueue({ from: 1, to: 3, repeatNew: 2, repeatChain: 1 });
    expect(q.map((x) => x.aya)).toEqual([1, 1, 2, 2, 1, 2, 3, 3, 1, 2, 3]);
    expect(q.filter((x) => x.kind === 'enchainer').map((x) => x.learning)).toEqual([2, 2, 3, 3, 3]);
  });

  it('masquage progressif : tout, la moitié, l’amorce, rien', () => {
    expect(visibleWords(4, 0)).toEqual([true, true, true, true]);
    expect(visibleWords(5, 1)).toEqual([true, true, true, false, false]);
    expect(visibleWords(4, 2)).toEqual([true, false, false, false]);
    expect(visibleWords(4, 3)).toEqual([false, false, false, false]);
  });

  it('riwāya : surlignage et mémorisation réservés à Ḥafṣ', () => {
    expect(canHighlight({ riwaya: 'hafs', surlignage: 'verset' })).toBe(true);
    expect(canHighlight({ riwaya: 'qalun', surlignage: 'sans_surlignage' })).toBe(false);
    expect(canHighlight({ riwaya: 'qalun' })).toBe(false);
    expect(canMemorize({ riwaya: 'hafs' })).toBe(true);
    expect(canMemorize({ riwaya: 'shuba' })).toBe(false);
  });

  it('vitesse bornée par quarts, durées lisibles, portion du carnet', () => {
    expect(clampRate(3)).toBe(1.5);
    expect(clampRate(0.6)).toBe(0.5);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(fmtDuration(83_000)).toBe('1:23');
    expect(fmtDuration(3_723_000)).toBe('1:02:03');
    expect(portionRange('2:1-5, 2:6-10')).toEqual({ s: 2, from: 1, to: 10 });
    expect(portionRange(null)).toBeNull();
  });
});
