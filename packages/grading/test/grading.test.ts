import { describe, expect, it } from 'vitest';
import type {
  ChasseExercise,
  CompleteExercise,
  ContientExercise,
  EcouteExercise,
  OrdreExercise,
  PremiereLettreExercise,
  RelierExercise,
  VraiFauxExercise,
} from '@awform/content/types';
import {
  checkComplete,
  checkEcoute,
  checkOrdre,
  checkPremiereLettre,
  correctResponse,
  exerciseTotal,
  gradeExercise,
  ordreSolution,
  ResponseTypeError,
} from '../src/index.js';

describe('règles du moteur (cas limites)', () => {
  it('premiere_lettre : comparaison exacte, sans retirer les crochets', () => {
    const ex: PremiereLettreExercise = {
      type: 'premiere_lettre',
      items: [{ suite: 'ـابٌ', reponse: 'ب', options: ['ب', 'ت', 'ث'] }],
    };
    expect(checkPremiereLettre(ex, 0, 'ب')).toBe(true);
    expect(checkPremiereLettre(ex, 0, '[ب]')).toBe(false);
    expect(checkPremiereLettre(ex, 0, 'ت')).toBe(false);
  });
  it('ecoute : compare à `reponse` si présent, sinon à `dit`, crochets retirés', () => {
    const ex: EcouteExercise = {
      type: 'ecoute',
      items: [
        { options: ['[بَ]', 'تَ', 'ثَ'], dit: 'بَ' },
        { options: ['٧', '٨', '٩'], dit: 'سَبْعَةٌ', reponse: '٧' },
      ],
    };
    expect(checkEcoute(ex, 0, '[بَ]')).toBe(true);
    expect(checkEcoute(ex, 1, '٧')).toBe(true);
    expect(checkEcoute(ex, 1, 'سَبْعَةٌ')).toBe(false);
  });
  it('complete : plain(choix) = plain(reponse) ; les voyelles comptent', () => {
    const ex: CompleteExercise = {
      type: 'complete',
      items: [{ avant: 'هٰذَا', options: ['بَابٌ', 'بَابًا', 'بَيْتٌ'], reponse: '[بَ]ابٌ' }],
    };
    expect(checkComplete(ex, 0, 'بَابٌ')).toBe(true);
    expect(checkComplete(ex, 0, 'بَابًا')).toBe(false);
  });
  it('ordre : étiquettes jointes par une espace, ou collées pour un ordre de syllabes', () => {
    const phrase: OrdreExercise = {
      type: 'ordre',
      items: [{ mots: ['بَابٌ', 'هٰذَا'], phrase: 'هٰذَا بَابٌ' }],
    };
    expect(checkOrdre(phrase, 0, [1, 0])).toBe(true);
    expect(checkOrdre(phrase, 0, [0, 1])).toBe(false);
    expect(checkOrdre(phrase, 0, [1])).toBe(false);
    expect(checkOrdre(phrase, 0, [1, 1])).toBe(false);
    const syll: OrdreExercise = { type: 'ordre', items: [{ mots: ['تَ', 'ثَ', 'بَ'], phrase: 'ثَبَتَ' }] };
    expect(ordreSolution(syll, 0)).toEqual([1, 2, 0]);
    expect(checkOrdre(syll, 0, [1, 2, 0])).toBe(true);
  });
  it('chasse : bare(case) = bare(cible) ; les erreurs sont comptées sans retirer de points', () => {
    const ex: ChasseExercise = { type: 'chasse', cible: 'بَ', grille: ['ب', 'ت', 'بـ', 'ـب', 'ن', 'ث'] };
    expect(exerciseTotal(ex)).toBe(3);
    const r = gradeExercise(ex, { type: 'chasse', selected: [0, 1, 2] });
    expect(r).toMatchObject({ total: 3, correct: 2, wrongSelections: 1 });
  });
  it('contient, relier, vrai_faux', () => {
    const c: ContientExercise = {
      type: 'contient',
      cible: 'ب',
      mots: [
        { ar: 'بَابٌ', oui: true },
        { ar: 'تُوتٌ', oui: false },
      ],
    };
    expect(gradeExercise(c, correctResponse(c)).score).toBe(1);
    const r: RelierExercise = { type: 'relier', items: [{ ar: 'بَابٌ' }, { ar: 'بَيْتٌ' }, { ar: 'تُوتٌ' }] };
    expect(gradeExercise(r, { type: 'relier', pairs: [0, 2, 1] }).correct).toBe(1);
    const v: VraiFauxExercise = { type: 'vrai_faux', items: [{ ar: 'هٰذَا بَابٌ', vrai: false }] };
    expect(gradeExercise(v, { type: 'vrai_faux', answers: [true] }).correct).toBe(0);
    expect(gradeExercise(v, { type: 'vrai_faux', answers: [null] }).correct).toBe(0);
  });
  it('refuse une réponse d’un autre type', () => {
    const v: VraiFauxExercise = { type: 'vrai_faux', items: [{ vrai: true }] };
    expect(() => gradeExercise(v, { type: 'relier', pairs: [0] })).toThrow(ResponseTypeError);
  });
});
