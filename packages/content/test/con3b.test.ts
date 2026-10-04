/**
 * Décision du chef de projet (04/10/2026, vérification sur les vrais livres) : un numéro de hadith SANS recueil
 * nommé (« sur le hadith 7392 ») n'est pas masqué automatiquement ; il devient un avertissement d'import nommé
 * `hadith_numero_sans_recueil`, pour relecture.
 */
import { describe, expect, it } from 'vitest';
import { checkUnit } from '../src/checks.js';
import { hadithNumbersWithoutCollection, maskHadithNumbers } from '../src/hadith.js';
import type { Lesson } from '../src/types.js';

describe('numéro de hadith sans recueil nommé', () => {
  it('repéré ; les références avec recueil (dans les deux sens) ne le sont pas', () => {
    expect(hadithNumbersWithoutCollection('repris sur le hadith 7392.')).toEqual(['hadith 7392']);
    expect(hadithNumbersWithoutCollection({ a: ['le ḥadīth n° 12 dit…'] })).toEqual([
      'ḥadīth n° 12',
    ]);
    for (const s of [
      "commentaire du hadith 6410 d'al-Bukhārī",
      'Malik, hadith n° 12',
      'Muslim (54)',
      'Al-Fātiḥa 1:2 ; 25 élèves',
      'Hadith 1 (à apprendre)',
      'Le hadith 2 corrige les deux.',
    ])
      expect(hadithNumbersWithoutCollection(s)).toEqual([]);
  });

  it('jamais masqué automatiquement ; versets ignorés', () => {
    expect(maskHadithNumbers('sur le hadith 7392', new Set()).masked).toBe(0);
    expect(hadithNumbersWithoutCollection({ versets: [{ fr: 'hadith 3' }] })).toEqual([]);
  });

  it('import : avertissement nommé, non bloquant', () => {
    const L = {
      n: 1,
      type: 'lecon',
      titre_ar: 'عُنْوَانٌ',
      titre_fr: 'Leçon',
      rubriques: [{ code: 'source', source_fr: 'Fatḥ al-Bārī, repris sur le hadith 7392.' }],
    } as unknown as Lesson;
    const issues = checkUnit('ra1.l05', 'ra1', L, null, 'l05.js').filter(
      (i) => i.code === 'hadith_numero_sans_recueil',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('avertissement');
    expect(issues[0]!.message).toContain('hadith 7392');
  });
});
