import { describe, expect, it } from 'vitest';
import {
  canHighlight,
  canMemorize,
  chainQueue,
  clampRate,
  fmtDuration,
  listenQueue,
  portionRange,
  SILENCE_CHOICES,
  silenceMs,
  visibleWords,
  wordClip,
} from './player';

describe('hifẓ complet — répétition fine', () => {
  it('répéter un verset N fois, puis la plage M fois', () => {
    expect(listenQueue({ from: 3, to: 4, repeatVerse: 3, repeatRange: 2 })).toEqual([
      3, 3, 3, 4, 4, 4, 3, 3, 3, 4, 4, 4,
    ]);
  });
  it('silence après chaque verset : au moins la durée du verset, à la vitesse choisie', () => {
    expect(SILENCE_CHOICES).toEqual([0, 1, 1.5, 2]);
    expect(silenceMs(4000, 0)).toBe(0);
    expect(silenceMs(4000, 1)).toBe(4000);
    expect(silenceMs(4000, 2)).toBe(8000);
    // jamais moins que le verset (facteur < 1 relevé à 1)
    expect(silenceMs(4000, 0.5)).toBe(4000);
    // vitesse 0,5× et 0,75× : le verset dure plus longtemps, le silence aussi
    expect(silenceMs(4000, 1, 0.5)).toBe(8000);
    expect(silenceMs(3000, 1, 0.75)).toBe(4000);
    expect(silenceMs(0, 1)).toBe(0);
  });
  it('vitesses 0,75× et 0,5× permises', () => {
    expect(clampRate(0.75)).toBe(0.75);
    expect(clampRate(0.5)).toBe(0.5);
  });
  it('partie d’un long verset : seulement avec les minutages par mot, jamais devinée', () => {
    expect(wordClip(undefined, 9000, 1, 2)).toBeNull();
    expect(wordClip([], 9000, 1, 2)).toBeNull();
    const ms = [0, 800, 1500, 2600, 4000];
    expect(wordClip(ms, 6000, 2, 3)).toEqual({ startMs: 800, endMs: 2600 });
    // jusqu'au dernier mot : fin du fichier
    expect(wordClip(ms, 6000, 4, 5)).toEqual({ startMs: 2600, endMs: 6000 });
    expect(wordClip(ms, 6000, 0, 2)).toBeNull();
    expect(wordClip(ms, 6000, 3, 2)).toBeNull();
    expect(wordClip(ms, 6000, 2, 9)).toBeNull();
  });
});

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
    expect(clampRate(3)).toBe(1.75);
    expect(clampRate(1.75)).toBe(1.75);
    expect(clampRate(1.5)).toBe(1.5);
    expect(clampRate(0.6)).toBe(0.5);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(fmtDuration(83_000)).toBe('1:23');
    expect(fmtDuration(3_723_000)).toBe('1:02:03');
    expect(portionRange('2:1-5, 2:6-10')).toEqual({ s: 2, from: 1, to: 10 });
    expect(portionRange(null)).toBeNull();
  });
});
