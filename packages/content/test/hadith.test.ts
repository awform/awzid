import { describe, expect, it } from 'vitest';
import { maskHadithNumbers, maskTree, verifiedHadiths } from '../src/hadith.js';

const reg = {
  A: { recueil: 'al-Bukhārī', numero: 1, statut: 'VERIFIE' },
  B: { recueil: 'Muslim', numero: 1907, statut: 'VERIFIE_AVEC_RESERVE' },
  C: { recueil: 'Muslim', numero: 54, statut: 'VERIFIE' },
  D: { recueil: 'Ibn Mājah', numero: 224, statut: 'VERIFIE' },
  E: { recueil: 'at-Tirmidhī', numero: 2645, statut: 'REFERENCE_A_CONFIRMER' },
};
const V = verifiedHadiths(reg);

describe('numéros de hadiths : seulement VERIFIE au registre', () => {
  it('garde les numéros vérifiés, retire les autres', () => {
    expect(maskHadithNumbers('al-Bukhārī (1) et Muslim (1907)', V)).toEqual({
      text: 'al-Bukhārī (1) et Muslim',
      masked: 1,
    });
    expect(maskHadithNumbers('rapporté par Muslim (54)', V).text).toBe('rapporté par Muslim (54)');
    expect(maskHadithNumbers('Muslim (1907, avec des mots très proches)', V).text).toBe(
      'Muslim (avec des mots très proches)',
    );
    expect(
      maskHadithNumbers('« le jeûne est un bouclier », al-Bukhārī 1894, Muslim 1151', V).text,
    ).toBe('« le jeûne est un bouclier », al-Bukhārī, Muslim');
    expect(maskHadithNumbers('Ibn Māja 224', V).text).toBe('Ibn Māja 224');
    expect(maskHadithNumbers('at-Tirmidhī (2645)', V).text).toBe('at-Tirmidhī');
    expect(maskHadithNumbers('Al-Fātiḥa 1:2 ; 25 élèves', V).masked).toBe(0);
  });
  it('sur toute une leçon', () => {
    const r = maskTree({ hadiths: [{ source_fr: 'Muslim (1907)', ar: 'x' }], n: 3 }, V);
    expect(r.value).toEqual({ hadiths: [{ source_fr: 'Muslim', ar: 'x' }], n: 3 });
    expect(r.masked).toBe(1);
  });
});
