import { describe, expect, it } from 'vitest';
import { blockingIssues, canJoin, loadEdition } from '../src/importer.js';
import { forbiddenPaths, studentProjection } from '../src/projection.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

describe('canJoin (règle « ordre »)', () => {
  it('reconnaît une phrase formée des étiquettes', () => {
    expect(canJoin('هٰذَا بَابٌ', ['بَابٌ', 'هٰذَا'], ' ')).toBe(true);
    expect(canJoin('ثَبَتَ', ['تَ', 'ثَ', 'بَ'], '')).toBe(true);
    expect(canJoin('هٰذَا بَيْتٌ', ['بَابٌ', 'هٰذَا'], ' ')).toBe(false);
  });
});

describe('projection élève', () => {
  it('retire tr, guide, *guide_fr, sources_fr, parents_fr, travail_perso_fr', () => {
    const L = {
      titre_fr: 'x',
      mots: [{ ar: 'بَابٌ', tr: 'bābun', fr: 'porte' }],
      guide: { deroule: [] },
      fiqh_adab: { points: [], guide_fr: 'g', sources_fr: 's' },
      coran: { tajwid: { texte_fr: 't', guide_fr: 'g' } },
      parents_fr: 'p',
      travail_perso_fr: 't',
    };
    const p = studentProjection(L);
    expect(forbiddenPaths(p)).toEqual([]);
    expect(p.mots[0]).toEqual({ ar: 'بَابٌ', fr: 'porte' });
    expect(forbiddenPaths(L).length).toBe(7);
  });
});

describe.skipIf(!HAS_CONTENT)('import réel en1 + ad1 (sans ressaisie)', () => {
  const load = loadEdition({ contentDir: CONTENT_DIR, levels: ['en1', 'ad1'] });

  it("n'a aucune erreur bloquante (versets = Tanzil, corrigés cohérents)", () => {
    expect(blockingIssues(load)).toEqual([]);
  });
  it('importe toutes les unités', () => {
    const count = Object.fromEntries(load.levels.map((l) => [l.code, l.units.length]));
    expect(count).toEqual({ en1: 26, ad1: 25 });
    expect(load.hifz.map((h) => h.code).sort()).toEqual(['ad1', 'en1']);
  });
  it('contrôle des versets', () => {
    expect(load.verseStats.total).toBeGreaterThan(100);
    expect(load.verseStats.erreurs).toBe(0);
  });
  it('identifiants d’exercices uniques et empreintes stables (deux imports identiques)', () => {
    const keys = load.levels.flatMap((l) => l.units.flatMap((u) => u.exercises.map((e) => e.key)));
    expect(new Set(keys).size).toBe(keys.length);
    const again = loadEdition({ contentDir: CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false });
    const keys2 = again.levels.flatMap((l) => l.units.flatMap((u) => u.exercises.map((e) => e.key)));
    expect(keys2).toEqual(keys);
    expect(again.sourceSha256).toBe(load.sourceSha256);
  });
  it('aucune fuite du guide ni de translittération dans la projection élève', () => {
    for (const l of load.levels)
      for (const u of l.units) expect(forbiddenPaths(studentProjection(u.content)), u.id).toEqual([]);
  });
  it('numérotation : leçons et bilans suivent index-lecons.js', () => {
    const en1 = load.levels.find((l) => l.code === 'en1');
    const bilans = en1?.units.filter((u) => u.kind === 'bilan') ?? [];
    expect(bilans.length).toBeGreaterThan(0);
    expect(bilans.every((b) => b.numBilan !== null && b.numLecon === null)).toBe(true);
  });
});
