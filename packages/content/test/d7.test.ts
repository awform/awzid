/**
 * Décision D7 (lot 21) : la projection ÉLÈVE d'un bilan ou d'un examen ne contient aucun corrigé ; celle d'une
 * leçon les garde (correction immédiate sur l'appareil). Texte non préparé : masqué hors session, révélé
 * pendant une session ouverte. « relier » : position affichée → élément d'origine.
 */
import { describe, expect, it } from 'vitest';
import { answerPaths, examProjection, relierOriginal, studentProjection } from '../src/index.js';

// leçon SYNTHÉTIQUE (lettres et mots courants, aucun texte religieux)
const base = (type: string) => ({
  n: 3,
  type,
  titre_ar: 'التَّقْوِيمُ',
  titre_fr: 'Bilan',
  lecture: { ligne: ['بَ'], non_prepare: true, vedette: { ar: 'بَابُ الْبَيْتِ', fr: 'la porte' } },
  exercices: [
    { type: 'premiere_lettre', items: [{ suite: 'ـَابٌ', reponse: 'ب', options: ['ب', 'ت'] }] },
    {
      type: 'relier',
      items: [
        { ar: 'بَابٌ', fr: 'porte' },
        { ar: 'بَيْتٌ', fr: 'maison' },
        { ar: 'قَلَمٌ', fr: 'stylo' },
      ],
    },
    { type: 'vrai_faux', items: [{ ar: 'بَابٌ', vrai: true }] },
  ],
});

describe('D7 — corrigés des bilans et examens', () => {
  it('bilan et examen : aucun corrigé dans la projection élève ; leçon : corrigés gardés', () => {
    for (const type of ['bilan', 'examen']) {
      const p = studentProjection(base(type), 'ad1');
      expect(answerPaths(p), type).toEqual([]);
      const rel = (p.exercices as Array<Record<string, unknown>>)[1]!;
      expect(rel.items).toBeUndefined();
      expect((rel.gauche as unknown[]).length).toBe(3);
    }
    expect(answerPaths(studentProjection(base('lecon'), 'ad1')).length).toBeGreaterThan(0);
  });
  it('texte non préparé : masqué hors session, révélé pendant la session (y compris bilans Enfants)', () => {
    for (const level of ['ad1', 'en1']) {
      expect(JSON.stringify(studentProjection(base('bilan'), level))).not.toContain(
        'بَابُ الْبَيْتِ',
      );
      const open = examProjection(base('bilan'), level, { revealUnprepared: true });
      expect(JSON.stringify(open), level).toContain('بَابُ الْبَيْتِ');
      expect(answerPaths(open)).toEqual([]);
    }
  });
  it('relier : la position affichée ramène à l’élément d’origine (décalage n/2)', () => {
    const p = studentProjection(base('bilan'), 'ad1');
    const droite = (p.exercices as Array<Record<string, unknown>>)[1]!.droite as Array<{
      fr: string;
    }>;
    const src = ['porte', 'maison', 'stylo'];
    droite.forEach((d, shown) => expect(src[relierOriginal(3, shown)]).toBe(d.fr));
  });
});
