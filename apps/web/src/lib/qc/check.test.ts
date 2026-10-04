import { describe, expect, it } from 'vitest';
import {
  chasseTargets,
  choiceOk,
  markColor,
  ordreOk,
  qcPlain,
  qcSegments,
  qcWords,
  repererExpected,
  sameSet,
  targets,
} from './check';

describe('livrets qc : affichage', () => {
  it('découpe les crochets sans toucher au texte', () => {
    expect(qcSegments('أَحَ[دٌ] [g:مِنْ]')).toEqual([
      { text: 'أَحَ', mark: null },
      { text: 'دٌ', mark: '' },
      { text: ' ', mark: null },
      { text: 'مِنْ', mark: 'g' },
    ]);
    expect(qcSegments('[m4:جَآءَ]')).toEqual([{ text: 'جَآءَ', mark: 'm4' }]);
    expect(qcSegments('sans crochet')).toEqual([{ text: 'sans crochet', mark: null }]);
    expect(qcPlain('أَحَ[دٌ] [g:مِنْ]')).toBe('أَحَدٌ مِنْ');
    expect(qcWords('الٓمٓ ۝ ٱللَّهُ لَآ')).toEqual(['الٓمٓ', 'ٱللَّهُ', 'لَآ']);
    expect([markColor('m6'), markColor('q'), markColor('g'), markColor('x')]).toEqual([0, 1, 2, 3]);
  });
});

describe('livrets qc : correction', () => {
  it('choix par indice, par valeur ou par texte d’option', () => {
    expect(choiceOk({ reponse: 1 }, 1)).toBe(true);
    expect(choiceOk({ reponse: 1 }, 0)).toBe(false);
    expect(choiceOk({ reponse: '4-5' }, '4-5')).toBe(true);
    expect(choiceOk({ reponse: 'ث', options: ['ن', 'ث'] }, 1)).toBe(true);
    expect(choiceOk({}, 0)).toBe(false);
  });
  it('chasse, repérage et ordre', () => {
    expect(chasseTargets(['ب', 'ت', 'ث', 'ت'], 'ت')).toEqual([1, 3]);
    expect(targets('بت')).toEqual(['ب', 'ت']);
    expect(targets('لٓ,مٓ')).toEqual(['لٓ', 'مٓ']);
    // rangs du livret (à partir de 1)
    expect(repererExpected({ ar: 'الٓمٓ ۝ ٱللَّهُ', reponse: [1] }, 'لٓ,مٓ')).toEqual([0]);
    // sinon : mots qui contiennent une cible
    expect(
      repererExpected({ ar: 'أَلَمْ تَرَ كَيْفَ [فَعَلَ] رَبُّكَ بِأَصْحَٰبِ' }, 'بت'),
    ).toEqual([1, 4, 5]);
    expect(sameSet([1, 4, 5], [5, 1, 4])).toBe(true);
    expect(sameSet([1, 4], [1, 4, 5])).toBe(false);
    expect(ordreOk({ mots: ['سَ', 'دَ', 'رَ'], phrase: 'دَرَسَ' }, [1, 2, 0])).toBe(true);
    expect(ordreOk({ mots: ['سَ', 'دَ', 'رَ'], phrase: 'دَرَسَ' }, [0, 1, 2])).toBe(false);
  });
});
