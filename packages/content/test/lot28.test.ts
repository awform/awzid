import { describe, expect, it } from 'vitest';
import { blockingIssues, loadEdition } from '../src/importer.js';
import { studentProjection } from '../src/projection.js';
import {
  checkQcSource,
  loadTanzil,
  qcQuranSources,
  qcSourceText,
  stripQcMarks,
} from '../src/quran.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

/**
 * Lot 28 — livrets « Lecture du Coran » (qc1 à qc3) : chaque extrait `src: "Q:…"` est contrôlé octet par
 * octet contre Tanzil à l'import (avant le lot 28 : aucun ne l'était), et la projection élève retire les
 * extraits non préparés et le sens des versets dans un bilan / examen.
 */
const BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const T = loadTanzil(
  [
    `1:1\t${BISM}`,
    '1:2\tٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
    `112:1\tبِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ`,
    '112:2\tٱللَّهُ ٱلصَّمَدُ',
  ].join('\n'),
);

describe('sources qc', () => {
  it('lit verset, plage de versets et mots, en ignorant les consignes d’affichage', () => {
    expect(qcSourceText('Q:1:2', T)).toBe('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ');
    expect(qcSourceText('Q:1:2:3-4|@1/ر', T)).toBe('رَبِّ ٱلْعَٰلَمِينَ');
    expect(qcSourceText('Q:112:1-2|L=ص', T)).toBe('قُلْ هُوَ ٱللَّهُ أَحَدٌ ۝ ٱللَّهُ ٱلصَّمَدُ');
    // les mots d'un verset 1 sont comptés sur le verset Tanzil complet (basmala comprise)
    expect(qcSourceText('Q:112:1:8', T)).toBe('أَحَدٌ');
    expect(qcSourceText('Q:1:9', T)).toBeNull();
    expect(qcSourceText('Q:1:2:3-9', T)).toBeNull();
    expect(qcSourceText('X:1:2', T)).toBeNull();
  });

  it('retire seulement les crochets de couleur', () => {
    expect(stripQcMarks('أَحَ[دٌ] [g:مِنْ] [m4:جَآءَ]')).toBe('أَحَدٌ مِنْ جَآءَ');
  });

  it('égalité stricte : un signe changé est un écart', () => {
    expect(checkQcSource('ٱلْحَمْدُ لِلَّهِ [رَبِّ] ٱلْعَٰلَمِينَ', 'Q:1:2', T).status).toBe(
      'identique',
    );
    expect(checkQcSource('رَبِّ ٱلْعَٰلَمِ[ي]نَ', 'Q:1:2:3-4', T).status).toBe('extrait');
    expect(checkQcSource('رَبِّ الْعَٰلَمِينَ', 'Q:1:2:3-4', T).status).toBe('ecart');
    expect(checkQcSource('أَحَدٌ', 'Q:9:999', T).status).toBe('reference_inconnue');
  });

  it('trouve les extraits où qu’ils soient dans l’unité', () => {
    const L = {
      echelle: [{ n: 4, items: ['[ب]', { src: 'Q:1:2:3', ar: 'رَبِّ' }] }],
      exercices: [{ type: 'arret', src: 'Q:1:2', ar: 'x', items: [] }],
      mushaf: [{ src: 'Q:112:2', ar: 'ٱللَّهُ ٱلصَّمَدُ' }],
    };
    expect(qcQuranSources(L).map((s) => s.path)).toEqual([
      'echelle[0].items[1]',
      'exercices[0]',
      'mushaf[0]',
    ]);
  });
});

describe('projection élève des livrets qc', () => {
  const unit = (type: string) => ({
    id: 'qc9.l27',
    type,
    titre_ar: 'x',
    titre_fr: 'x',
    n: 27,
    mushaf: [
      { src: 'Q:1:2', ar: 'a', sens_fr: 'sens', role: 'lecture' },
      { src: 'Q:112:2', ar: 'b', non_prepare: true, role: 'lecture' },
      { src: 'Q:112:1', ar: 'c', non_prepare: true, role: 'lecture' },
    ],
  });
  it('examen : non préparé absent (une marque), sens retiré ; révélé en session', () => {
    const s = studentProjection(unit('examen'), 'qc9') as { mushaf: object[] };
    expect(s.mushaf).toEqual([{ src: 'Q:1:2', ar: 'a', role: 'lecture' }, { non_prepare: true }]);
    const r = studentProjection(unit('examen'), 'qc9', { revealUnprepared: true }) as {
      mushaf: Array<{ ar?: string }>;
    };
    expect(r.mushaf.map((m) => m.ar)).toEqual(['a', 'b', 'c']);
  });
  it('leçon : le sens reste', () => {
    const s = studentProjection(unit('lecon'), 'qc9') as { mushaf: Array<{ sens_fr?: string }> };
    expect(s.mushaf[0]?.sens_fr).toBe('sens');
  });
});

describe.skipIf(!HAS_CONTENT)('carnets de hifẓ publiés', () => {
  it('seuls les carnets demandés (gelés) sont chargés, et jamais sans leur livre', () => {
    const load = loadEdition({
      contentDir: CONTENT_DIR,
      levels: ['ad5', 'ad6'],
      hifzLevels: ['en1', 'ad5'],
      withIllustrations: false,
      withBooklets: false,
    });
    expect(load.hifz.map((h) => h.code)).toEqual(['ad5']);
  });
});

describe.skipIf(!HAS_CONTENT)('vrais livrets qc1 à qc3', () => {
  it('chaque extrait du Coran est contrôlé contre Tanzil, sans erreur', () => {
    const load = loadEdition({
      contentDir: CONTENT_DIR,
      levels: ['qc1', 'qc2', 'qc3'],
      withIllustrations: false,
    });
    expect(load.levels.map((l) => l.code)).toEqual(['qc1', 'qc2', 'qc3']);
    expect(load.verseStats.total).toBeGreaterThan(900);
    expect(load.verseStats.erreurs).toBe(0);
    expect(blockingIssues(load)).toEqual([]);
    for (const l of load.levels)
      for (const u of l.units) {
        const s = JSON.stringify(studentProjection(u.content, l.code));
        expect(s).not.toMatch(/guide_fr|"guide"/);
      }
  });
});
