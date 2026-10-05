import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/canonical.js';
import { frozenLevels, loadIdMaps, loadLineage } from '../src/importer.js';
import { blockMadhhabs, levelMadhhab, registryMadhhab } from '../src/madhhab.js';
import {
  applySuspensions,
  BLOCK_PATH,
  blockAt,
  blockFingerprint,
  isSuspended,
} from '../src/suspension.js';
import { pickTranslation, translatableFields, type TranslationRow } from '../src/translation.js';

describe('lot F1 — identifiants gelés et lignée (E5)', () => {
  it('niveaux gelés lus dans les tables ; lignée déclarée contrôlée', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ids-f1-'));
    writeFileSync(
      join(dir, 'ad2-correspondance.json'),
      JSON.stringify({
        correspondance: { 'ad2.l01.ex1': 'ad2.l01.ex1', 'ad2.l01.ex2': 'ad2.l01.ex2' },
      }),
    );
    writeFileSync(
      join(dir, 'lignee.json'),
      JSON.stringify({
        lignee: [
          { de: 'ad2.l01.ex2', vers: 'ad2.l01.ex7', nature: 'remplace', motif: 'consigne refaite' },
          { de: 'ad2.l01.ex1', vers: null, nature: 'retire' },
          { de: 'ad2.l01.ex3', vers: null, nature: 'remplace' }, // remplacement sans cible : refusé
          { de: 'pas un id', vers: 'ad2.l01.ex1', nature: 'gel' },
        ],
      }),
    );
    const issues: Parameters<typeof loadLineage>[1] = [];
    expect([...frozenLevels(loadIdMaps(dir, issues))]).toEqual(['ad2']);
    const l = loadLineage(dir, issues);
    expect(l).toEqual([
      { from: 'ad2.l01.ex2', to: 'ad2.l01.ex7', kind: 'remplace', note: 'consigne refaite' },
      { from: 'ad2.l01.ex1', to: null, kind: 'retire', note: null },
    ]);
    expect(issues.map((i) => i.code)).toEqual(['lignee_invalide', 'lignee_invalide']);
    expect(loadLineage(join(dir, 'absent'), [])).toEqual([]);
  });
});

describe('lot F1 — école juridique (G2)', () => {
  it('niveaux : sciences islamiques mālikites, arabe et Coran communs ; champ explicite prioritaire', () => {
    expect(levelMadhhab('re1')).toBe('maliki');
    expect(levelMadhhab('ra4')).toBe('maliki');
    expect(['en1', 'ad10', 'ado2', 'qc1'].map((c) => levelMadhhab(c))).toEqual([
      'commun',
      'commun',
      'commun',
      'commun',
    ]);
    expect(levelMadhhab('ra1', { madhhab: 'hanafi' })).toBe('hanafi');
    expect(levelMadhhab('ra1', { madhhab: 'inconnu' })).toBe('maliki');
  });
  it('registre : fiqh selon le préfixe, versets et hadiths communs', () => {
    expect(registryMadhhab('fiqh', 'FIQH_MAL_AD1_l06_1')).toBe('maliki');
    expect(registryMadhhab('fiqh', 'FIQH_HAN_X_l01_1')).toBe('hanafi');
    expect(registryMadhhab('hadith', 'HAD_BUK_00001')).toBe('commun');
    expect(registryMadhhab('coran', 'QUR_001_001')).toBe('commun');
    expect(registryMadhhab('fiqh', 'FIQH_X', { madhhab: 'shafii' })).toBe('shafii');
  });
  it('blocs : fiqh_adab et rubriques de fiqh, sans toucher au texte', () => {
    const L = {
      fiqh_adab: { points: [{ fr: 'x' }] },
      rubriques: [
        { code: 'aqida' },
        { code: 'fiqh' },
        { code: 'extraits' },
        { code: 'usra', madhhab: 'hanbali' },
      ],
    };
    const before = JSON.stringify(L);
    expect(blockMadhhabs(L)).toEqual({
      fiqh_adab: 'maliki',
      'rubriques.1': 'maliki',
      'rubriques.2': 'maliki',
      'rubriques.3': 'hanbali',
    });
    expect(JSON.stringify(L)).toBe(before);
    expect(blockMadhhabs({ lecture: {} })).toEqual({});
  });
});

describe('lot F1 — suspension d’urgence (M1)', () => {
  const unit = {
    id: 'en1.l02',
    sha256: 'x',
    lesson: {
      titre_ar: 'ع',
      titre_fr: 'Leçon',
      coran: {
        versets: [
          { ar: 'أ', ref_fr: '1:1' },
          { ar: 'ب', ref_fr: '1:2' },
        ],
      },
      exercices: [{ type: 'vrai_faux' }, { type: 'complete' }],
    },
    exercises: [
      { id: 'en1.l02.ex1', position: 1 },
      { id: 'en1.l02.ex2', position: 2 },
    ],
  };
  it('bloc masqué à son chemin (empreinte vérifiée), exercice par son id gelé ; original intact', () => {
    const v = blockAt(unit.lesson, 'coran.versets.1');
    const m = applySuspensions(unit, [
      { unitId: 'en1.l02', path: 'coran.versets.1', fp: blockFingerprint(v) },
      { unitId: 'en1.l02', path: 'ex:en1.l02.ex2' },
      { unitId: 'autre.l01', path: '' },
    ]);
    const L = m.lesson as typeof unit.lesson & { _suspendu?: number };
    expect(isSuspended(L.coran.versets[1])).toBe(true);
    expect(L.coran.versets[0]).toEqual({ ar: 'أ', ref_fr: '1:1' });
    expect(isSuspended(L.exercices[1])).toBe(true);
    expect(L._suspendu).toBe(2);
    expect(unit.lesson.coran.versets[1]).toEqual({ ar: 'ب', ref_fr: '1:2' });
  });
  it('bloc corrigé depuis (empreinte différente) : plus masqué ; leçon entière : titres seulement', () => {
    expect(
      applySuspensions(unit, [{ unitId: 'en1.l02', path: 'coran.versets.1', fp: 'deadbeef' }]),
    ).toBe(unit);
    const all = applySuspensions(unit, [{ unitId: 'en1.l02', path: '' }]);
    expect(all.lesson).toEqual({ titre_ar: 'ع', titre_fr: 'Leçon', _suspendu: 'unite' });
    expect(all.exercises).toEqual([]);
  });
  it('chemins acceptés', () => {
    for (const p of ['', 'fiqh_adab', 'coran.versets.2', 'rubriques.3.hadiths.0', 'ex:ad2.l03.ex4'])
      expect(BLOCK_PATH.test(p), p).toBe(true);
    for (const p of ['__proto__.x', 'a.b.c.d.e.f.g.h', 'coran..x', 'ex:'])
      expect(BLOCK_PATH.test(p), p).toBe(false);
  });
});

describe('lot F1 — traduction des contenus, structure vide (G1)', () => {
  it('champs français traduisibles ; religieux repérés ; guide et translittération exclus', () => {
    const f = translatableFields({
      consigne_fr: 'Lis.',
      mots: [{ ar: 'بَابٌ', tr: 'bābun', fr: 'porte' }],
      coran: { versets: [{ ar: 'x', fr: 'Au nom de Dieu', ref_fr: '1:1' }] },
      guide: { deroule_fr: 'enseignant' },
      parents_fr: 'p',
    });
    expect(f.map((x) => [x.path, x.religious])).toEqual([
      ['consigne_fr', false],
      ['mots.0.fr', false],
      ['coran.versets.0.fr', true],
      ['coran.versets.0.ref_fr', true],
    ]);
    expect(translatableFields({ texte: [{ fr: 'a' }] }, true)[0]?.religious).toBe(true);
  });
  it('servie seulement sur la source actuelle ; religieux : validée par le référent', () => {
    const src = sha256Hex('Au nom de Dieu');
    const row = (o: Partial<TranslationRow>): TranslationRow => ({
      locale: 'en',
      version: 1,
      status: 'relue',
      religious: false,
      sourceSha256: src,
      text: 'In the name of God',
      ...o,
    });
    expect(pickTranslation([row({})], 'en', src)?.text).toBe('In the name of God');
    expect(pickTranslation([row({ religious: true })], 'en', src)).toBeNull();
    expect(
      pickTranslation([row({ religious: true, status: 'validee' })], 'en', src),
    ).not.toBeNull();
    expect(pickTranslation([row({ sourceSha256: 'ancienne' })], 'en', src)).toBeNull();
    expect(pickTranslation([row({}), row({ version: 2, text: 'v2' })], 'en', src)?.text).toBe('v2');
    expect(pickTranslation([row({})], 'fr', src)).toBeNull();
  });
});
