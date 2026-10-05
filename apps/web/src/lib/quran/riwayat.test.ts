import { describe, expect, it } from 'vitest';
import { RIWAYA_TEXTS as IMPORT } from '@awform/content/riwayat';
import {
  RIWAYA_TEXTS,
  highlightOn,
  isMushafRiwaya,
  MUSHAF_RIWAYAT,
  parseRiwayaSura,
  readMushafRiwaya,
  tajwidForMushaf,
  translationForMushaf,
  writeMushafRiwaya,
} from './riwayat';

const files = (n: number, extra: number[] = []) => [
  ...extra.map((aya) => ({ aya })),
  ...Array.from({ length: n }, (_, i) => ({ aya: i + 1 })),
];

describe('A8 — muṣḥafs des riwāyāt', () => {
  it('Ḥafṣ en premier (par défaut), puis les six riwāyāt du Complexe, nommées en clair', () => {
    expect(MUSHAF_RIWAYAT.map((m) => m.key)).toEqual([
      'hafs',
      'warsh',
      'qalun',
      'shuba',
      'susi',
      'duri',
      'bazzi',
    ]);
    expect(MUSHAF_RIWAYAT.find((m) => m.key === 'warsh')?.fr).toBe('Warsh ʿan Nāfiʿ');
    expect(isMushafRiwaya('warsh')).toBe(true);
    expect(isMushafRiwaya('qunbul')).toBe(false);
  });

  it('fiches de l’interface = définitions de l’importeur (version, police)', () => {
    expect(RIWAYA_TEXTS.map((d) => [d.key, d.fr, d.ar, d.version, d.font, d.fontVersion])).toEqual(
      IMPORT.map((d) => [d.key, d.fr, d.ar, d.version, d.font, d.fontVersion]),
    );
  });

  it('réglage commun gardé sur l’appareil ; Ḥafṣ si absent ou inconnu', () => {
    const m = new Map<string, string>();
    const st = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    expect(readMushafRiwaya(st)).toBe('hafs');
    writeMushafRiwaya('qalun', st);
    expect(readMushafRiwaya(st)).toBe('qalun');
    m.set('awzid.riwaya-texte.v1', 'inconnue');
    expect(readMushafRiwaya(st)).toBe('hafs');
    expect(
      readMushafRiwaya({
        getItem: () => {
          throw new Error('bloqué');
        },
      }),
    ).toBe('hafs');
  });

  it('tajwid en couleurs et traduction du sens : Ḥafṣ seulement', () => {
    expect(tajwidForMushaf('hafs')).toBe(true);
    expect(translationForMushaf('hafs')).toBe(true);
    for (const k of ['warsh', 'qalun', 'shuba', 'susi', 'duri', 'bazzi']) {
      expect(tajwidForMushaf(k)).toBe(false);
      expect(translationForMushaf(k)).toBe(false);
    }
  });

  it('fichier de sourate lu sans toucher au texte', () => {
    const text = 'ࡴ۬لْحَمْدُ لِلهِ رَبِّ ࡴ۬لْعَٰلَمِينَ ۝١';
    const d = parseRiwayaSura({
      key: 'warsh',
      version: 'v',
      s: 1,
      name: 'n',
      t: [[1, 1, 1, text]],
    });
    expect(d.verses.get(1)).toEqual({ a: 1, page: 1, juz: 1, text });
  });

  describe('surlignage du verset entendu', () => {
    const hafs = { riwaya: 'hafs', surlignage: 'verset' };
    const qalun = { riwaya: 'qalun', surlignage: 'sans_surlignage' };
    const duri = { riwaya: 'duri', surlignage: 'sans_surlignage' };
    it('muṣḥaf Ḥafṣ : récitation en Ḥafṣ seulement (règle du lot 27)', () => {
      expect(highlightOn(hafs, 'hafs', { files: files(7) }, 7)).toBe(true);
      expect(highlightOn(qalun, 'hafs', { files: files(7) }, 7)).toBe(false);
      expect(
        highlightOn({ ...hafs, surlignage: 'sans_surlignage' }, 'hafs', { files: files(7) }, 7),
      ).toBe(false);
    });
    it('même riwāya que le muṣḥaf affiché : surlignage (annexes basmala ignorées)', () => {
      expect(highlightOn(qalun, 'qalun', { files: files(7, [0]) }, 7)).toBe(true);
      expect(highlightOn(duri, 'duri', { mode: 'versets', files: files(285) }, 285)).toBe(true);
    });
    it('jamais une riwāya sur le texte d’une autre', () => {
      expect(highlightOn(qalun, 'warsh', { files: files(7) }, 7)).toBe(false);
      expect(highlightOn(hafs, 'shuba', { files: files(7) }, 7)).toBe(false);
      expect(highlightOn(duri, 'susi', { files: files(30) }, 30)).toBe(false);
    });
    it('numérotation différente (al-Mulk d’ad-Dūrī : 31 fichiers, 30 versets dans le texte) : pas de surlignage', () => {
      expect(highlightOn(duri, 'duri', { files: files(31) }, 30)).toBe(false);
      expect(highlightOn(duri, 'duri', { files: files(29) }, 30)).toBe(false);
    });
    it('sourate écoutée en entier (repli) : pas de surlignage', () => {
      expect(
        highlightOn({ riwaya: 'susi' }, 'susi', { mode: 'sourate', files: [{ aya: 0 }] }, 31),
      ).toBe(false);
      expect(highlightOn(hafs, 'hafs', { mode: 'sourate', files: [{ aya: 0 }] }, 53)).toBe(false);
      expect(highlightOn(null, 'hafs', null, 7)).toBe(false);
    });
  });
});
