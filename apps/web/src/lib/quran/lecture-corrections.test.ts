import { describe, expect, it } from 'vitest';
import { listenFiles, playQueue, reciterFor } from './lecture';
import { readPrefs, TEXT_SCALE } from './mushaf';
import { highlightOn } from './riwayat';

/**
 * Corrections du lecteur (06/10/2026) — « je touche un verset pour le répéter, il lit le verset au-dessus ».
 * Cause : le fichier « verset n » d'un récitateur était demandé quel que soit le muṣḥaf affiché ; or la
 * numérotation change d'une riwāya à l'autre (« الم » = 2:1 en Ḥafṣ, pas en Qālūn : le verset 90 de Qālūn est
 * le 91 de Ḥafṣ). Désormais le récitateur suit le muṣḥaf, et la file n'est faite de numéros que si la récitation
 * est découpée comme le texte affiché.
 */
const R = [
  { id: 'ayyoub-hafs', riwaya: 'hafs', surlignage: 'verset' },
  { id: 'huthify-hafs', riwaya: 'hafs', surlignage: 'verset' },
  { id: 'huthify-qalun', riwaya: 'qalun', surlignage: 'sans_surlignage' },
  { id: 'juhani-duri', riwaya: 'duri', surlignage: 'sans_surlignage' },
];
const files = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ aya: from + i }));
const settings = { repeatVerse: 20, repeatRange: 1, chain: false, repeatNew: 5, repeatChain: 2 };

describe('le verset lu est le verset touché', () => {
  it('reciterFor : le récitateur suit la riwāya du muṣḥaf (préféré, sinon le premier, sinon aucun)', () => {
    expect(reciterFor(R, 'hafs', ['huthify-hafs'])).toBe('huthify-hafs');
    expect(reciterFor(R, 'hafs', ['huthify-qalun', null])).toBe('ayyoub-hafs');
    expect(reciterFor(R, 'qalun', ['ayyoub-hafs'])).toBe('huthify-qalun');
    expect(reciterFor(R, 'warsh', ['ayyoub-hafs'])).toBeNull();
  });

  it('même riwāya, même découpage : « Répéter ce verset » joue le fichier du verset touché', () => {
    const q = playQueue({ s: 2, from: 90, to: 90 }, settings).queue;
    const pack = { mode: 'versets', files: files(286) };
    expect(highlightOn(R[0]!, 'hafs', pack, 286)).toBe(true);
    expect(listenFiles(pack, true, q)[0]).toBe(90);
    // al-Fātiḥa de Qālūn : 7 fichiers (basmala en annexe, non importée) = 7 versets du texte de Qālūn
    const qf = { mode: 'versets', files: files(7) };
    expect(highlightOn(R[2]!, 'qalun', qf, 7)).toBe(true);
    expect(listenFiles(qf, true, [3])).toEqual([3]);
  });

  it('autre riwāya que le texte affiché : jamais aligné (c’était la cause du décalage)', () => {
    const pack = { mode: 'versets', files: files(285) };
    expect(highlightOn(R[2]!, 'hafs', pack, 286)).toBe(false);
    expect(highlightOn(R[0]!, 'qalun', { mode: 'versets', files: files(286) }, 285)).toBe(false);
  });

  it('même riwāya mais découpage différent (al-Mulk d’ad-Dūrī 31/30) ou sourate entière : la sourate entière', () => {
    const duri = { mode: 'versets', files: files(31) };
    expect(highlightOn(R[3]!, 'duri', duri, 30)).toBe(false);
    expect(listenFiles(duri, false, [5, 5, 5])).toEqual(files(31).map((f) => f.aya));
    expect(listenFiles({ mode: 'sourate', files: [{ aya: 0 }] }, false, [5])).toEqual([0]);
    expect(listenFiles(null, false, [5])).toEqual([5]);
  });
});

describe('réglages du lecteur gardés', () => {
  it('style de page (exact / fluide) et taille du texte, valeurs bornées', () => {
    const store = (v: unknown) => ({ getItem: () => JSON.stringify(v) });
    expect(readPrefs(store({})).style).toBe('exact');
    expect(readPrefs(store({ style: 'fluide', size: 2 }))).toMatchObject({
      style: 'fluide',
      size: 2,
    });
    expect(readPrefs(store({ style: 'x', size: 9 }))).toMatchObject({
      style: 'exact',
      size: TEXT_SCALE.length - 1,
    });
  });
});
