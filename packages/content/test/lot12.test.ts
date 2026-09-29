import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkQuranData,
  loadTanzil,
  parseQuranData,
  tanwinDisplay,
  tanwinUndo,
  TANZIL_QURAN_DATA_SHA256,
} from '../src/index.js';

const CONTENT = process.env.AWFORM_CONTENT_DIR ?? join(process.env.HOME ?? '', 'awform-content');
const QD = join(CONTENT, 'coran', 'tanzil-quran-data.js');
const TSV = join(CONTENT, 'coran', 'tanzil-uthmani.tsv');

describe('tanwins du Muṣḥaf de Médine (affichage seulement)', () => {
  it('fusion / dissimulation → tanwin décalé U+08F0-08F2', () => {
    expect(tanwinDisplay('بًۭ')).toBe('بࣰ');
    expect(tanwinDisplay('بٌۭ')).toBe('بࣱ');
    expect(tanwinDisplay('بٍۢ')).toBe('بࣲ');
  });
  it('conversion (iqlāb) → une seule voyelle + petite mīm', () => {
    expect(tanwinDisplay('بًۢ')).toBe('بَۢ');
    expect(tanwinDisplay('بٌۢ')).toBe('بُۢ');
    expect(tanwinDisplay('بٍۭ')).toBe('بِۭ');
  });
  it('crochet de couleur entre le tanwin et la mīm : conservé à sa place', () => {
    expect(tanwinDisplay('[بً]ۭ')).toBe('[بࣰ]');
    expect(tanwinDisplay('[بً]ۢ')).toBe('[بَ]ۢ');
  });
  it('rien d’autre ne change ; inversion exacte', () => {
    const s = 'بً بٌ ۢ بَ';
    expect(tanwinDisplay(s)).toBe(s);
    for (const x of ['بًۭ', 'بٍۢ', 'بٌۢ', 'بٍۭ']) expect(tanwinUndo(tanwinDisplay(x))).toBe(x);
  });
  it.skipIf(!existsSync(TSV))(
    'sur les 6 236 versets du Tanzil : inversion exacte, plus aucune suite tanwin + mīm',
    () => {
      const tanzil = loadTanzil(readFileSync(TSV, 'utf8'));
      let changed = 0;
      for (const v of tanzil.values()) {
        const d = tanwinDisplay(v);
        if (d !== v) changed++;
        expect(tanwinUndo(d)).toBe(v);
        expect(/[ً-ٍ][ۭۢ]/.test(d)).toBe(false);
      }
      expect(changed).toBeGreaterThan(1000);
    },
  );
});

describe('métadonnées officielles Tanzil (quran-data.js)', () => {
  it('lecture sans exécution : paires numériques seulement', () => {
    const src = `QuranData.Sura = [\n\t[],\n\t[0, 7, 5, 1, 'x', "y", 'z', 'Meccan'],\n\t[7, 286, 87, 40, 'x', "y", 'z', 'Medinan'],\n\t[293, 1]\n];\nQuranData.Juz = [\n\t[],\t[1, 1], \t[2, 142],\n\t[115, 1]\n];\nQuranData.HizbQaurter = [\n\t[], [1, 1], [115, 1]\n];\nQuranData.Page = [\n\t[], [1, 1], [2, 1], [115, 1]\n];\nQuranData.Manzil = [\n\t[], [1, 1]\n];`;
    const d = parseQuranData(src);
    expect(d.ayas).toEqual([7, 286]);
    expect(d.juz).toEqual([
      [1, 1],
      [2, 142],
    ]);
    expect(d.pages).toHaveLength(2);
    expect(checkQuranData(src, d).ok).toBe(false);
  });
  it.skipIf(!existsSync(QD))(
    'fichier officiel : 30 ajzāʾ, 240 quarts, 604 pages, 114 sourates, 6 236 versets, empreinte',
    () => {
      const src = readFileSync(QD, 'utf8');
      const d = parseQuranData(src);
      expect(d.juz).toHaveLength(30);
      expect(d.quarters).toHaveLength(240);
      expect(d.pages).toHaveLength(604);
      expect(d.ayas).toHaveLength(114);
      expect(d.ayas.reduce((a, b) => a + b, 0)).toBe(6236);
      const chk = checkQuranData(src, d);
      expect(chk.errors).toEqual([]);
      expect(chk.sha256).toBe(TANZIL_QURAN_DATA_SHA256);
    },
  );
});
