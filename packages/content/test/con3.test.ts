/**
 * Audit CON-3 : masquage des numéros de hadith non vérifiés — motif tolérant (sans macrons, francisé, arabe,
 * chiffres arabes, « hadith n° », Mālik et le Muwaṭṭaʾ, Bayhaqī, Dāraquṭnī, Ḥākim, Ṭabarānī) ; sans registre,
 * tout numéro est retiré ; les versets du Coran ne sont jamais touchés.
 */
import { describe, expect, it } from 'vitest';
import { maskHadithNumbers, maskTree, unmaskedHadithRefs, verifiedHadiths } from '../src/hadith.js';

const V = verifiedHadiths({ A: { recueil: 'al-Bukhārī', numero: 1, statut: 'VERIFIE' } });
const NONE = new Set<string>();

describe('audit CON-3 — numéros de hadith', () => {
  it.each([
    ['Bukhari 7', 'Bukhari'],
    ['Boukhari n° 7', 'Boukhari'],
    ['البخاري ٣٤', 'البخاري'],
    ['رواه البُخَارِيُّ ٣٤', 'رواه البُخَارِيُّ'],
    ['Muslim, 54', 'Muslim'],
    ['Ṣaḥīḥ Muslim (n° 54)', 'Ṣaḥīḥ Muslim'],
    ['Muwaṭṭaʾ Mālik 12', 'Muwaṭṭaʾ Mālik'],
    ['Malik, hadith n° 12', 'Malik'],
    ['al-Muwaṭṭaʾ (12)', 'al-Muwaṭṭaʾ'],
    ['al-Bayhaqī 88', 'al-Bayhaqī'],
    ['ad-Dāraquṭnī 3', 'ad-Dāraquṭnī'],
    ['al-Ḥākim 5', 'al-Ḥākim'],
    ['aṭ-Ṭabarānī 9', 'aṭ-Ṭabarānī'],
    ['Abou Daoud 30', 'Abou Daoud'],
    ['Tirmidhi 2645', 'Tirmidhi'],
    ['مسلم رقم ٥٤', 'مسلم'],
  ])('« %s » → « %s »', (src, out) => {
    expect(maskHadithNumbers(src, V).text).toBe(out);
  });

  it('les numéros vérifiés restent, quelle que soit la graphie', () => {
    expect(maskHadithNumbers('Bukhari 1', V).text).toBe('Bukhari 1');
    expect(maskHadithNumbers('البخاري ١', V).text).toBe('البخاري ١');
  });

  it('sans registre : tout numéro est retiré ; un texte ordinaire n’est pas touché', () => {
    expect(maskHadithNumbers('al-Bukhārī 7', NONE).text).toBe('al-Bukhārī');
    expect(maskHadithNumbers('Al-Fātiḥa 1:2 ; 25 élèves ; page 12', NONE).masked).toBe(0);
  });

  it('les versets du Coran ne sont jamais modifiés (octet par octet)', () => {
    const lecon = {
      coran: { versets: [{ ar: 'مُسْلِمِينَ ١', ref: '2:128' }] },
      source_fr: 'Muslim 54',
    };
    const r = maskTree(lecon, NONE);
    expect(r.value.coran.versets[0]!.ar).toBe('مُسْلِمِينَ ١');
    expect(r.value.source_fr).toBe('Muslim');
  });

  it('contrôle : repère une référence non masquée', () => {
    expect(unmaskedHadithRefs({ a: 'Muslim 54', b: 'Bukhari 1' }, V)).toEqual(['Muslim 54']);
  });

  // forme inversée, vue dans les vrais livres (ra1.l05, ra3.l16 : « commentaire du hadith 6410 d'al-Bukhārī »)
  it.each([
    ["commentaire du hadith 6410 d'al-Bukhārī", "commentaire du hadith d'al-Bukhārī"],
    [
      'commentaire du hadith 6410 d’al-Bukhārī (livre)',
      'commentaire du hadith d’al-Bukhārī (livre)',
    ],
    ['le ḥadīth n° 54 de Muslim', 'le ḥadīth de Muslim'],
    ['hadith 30 chez Abū Dāwūd', 'hadith chez Abū Dāwūd'],
    ['hadith 2645 at-Tirmidhī', 'hadith at-Tirmidhī'],
  ])('forme inversée « %s » → « %s »', (src, out) => {
    expect(maskHadithNumbers(src, V).text).toBe(out);
    expect(unmaskedHadithRefs({ a: src }, V)).toHaveLength(1);
    expect(unmaskedHadithRefs({ a: out }, V)).toEqual([]);
  });

  it('forme inversée : un numéro vérifié reste ; un hadith numéroté dans la leçon n’est pas touché', () => {
    expect(maskHadithNumbers("hadith 1 d'al-Bukhārī", V).text).toBe("hadith 1 d'al-Bukhārī");
    expect(unmaskedHadithRefs({ a: "hadith 1 d'al-Bukhārī" }, V)).toEqual([]);
    for (const s of ['Le hadith 2 corrige les deux.', '(39:53, hadith 37) → ne pas désespérer'])
      expect(maskHadithNumbers(s, NONE).masked).toBe(0);
  });
});
