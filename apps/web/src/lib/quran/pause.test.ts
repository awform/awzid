import { describe, expect, it } from 'vitest';
import { pauseGroups } from './pause';

describe('signes de pause rattachés au mot précédent (affichage)', () => {
  it('rattache ۛ et ۖ au mot qui précède, sans toucher aux autres mots', () => {
    // lettres neutres (aucun texte coranique retapé), signes de pause réels
    const ws = 'أ بَ ۛ تِ ۖ ث'.split(' ');
    expect(pauseGroups(ws)).toEqual([[0], [1, 2], [3, 4], [5]]);
    // les mots, joints par les mêmes espaces, redonnent le texte d'origine
    expect(
      pauseGroups(ws)
        .map((g) => g.map((i) => ws[i]).join(' '))
        .join(' '),
    ).toBe(ws.join(' '));
  });
  it('signe en tête (aucun mot avant) : laissé seul ; tous les signes U+06D6 à U+06DC', () => {
    expect(pauseGroups(['ۖ', 'كَلِمَة'])).toEqual([[0], [1]]);
    for (const c of ['ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', 'ۛ', 'ۜ'])
      expect(pauseGroups(['أ', c, 'ب'])).toEqual([[0, 1], [2]]);
    expect(pauseGroups(['أ', 'ب'])).toEqual([[0], [1]]);
  });
});
