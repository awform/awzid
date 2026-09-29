/**
 * Audit CON-2 : la projection élève retire par MOTIF (et non par liste de noms) tout champ de translittération,
 * de phonétique, de guide, d'enseignant ou de corrigé inconnu ; l'import signale chaque champ retiré et
 * refuse une projection où il en resterait un.
 */
import { describe, expect, it } from 'vitest';
import { checkUnit } from '../src/checks.js';
import { parentProjection, studentLeaks, studentProjection } from '../src/projection.js';
import type { Lesson } from '../src/types.js';

const piege: Lesson = {
  n: 1,
  type: 'lecon',
  titre_ar: 'عُنْوَانٌ',
  titre_fr: 'Leçon',
  translit: 'PIEGE_TRANSLIT',
  phonetique: 'PIEGE_PHON',
  prononciation_fr: 'PIEGE_PRONON',
  corrige: 'PIEGE_CORRIGE_RACINE',
  tr_fr: 'PIEGE_TRFR',
  notes: 'PIEGE_NOTES',
  lecture: {
    vedette: {
      ar: 'بَابٌ',
      translitteration: 'PIEGE_TRANSLITTERATION',
      note_fr: 'note gardée',
    } as never,
    guide_ar: 'PIEGE_GUIDE_AR',
  },
  mots: [{ ar: 'بَابٌ', fr: 'porte', reponse: 'PIEGE_REPONSE' } as never],
  exercices: [
    {
      type: 'complete',
      corrige_ex: 'PIEGE_CORRIGE_EX',
      solution: 'PIEGE_SOLUTION',
      guide_enseignant: 'PIEGE_GUIDE_ENS',
      items: [
        {
          options: ['بَ', 'بِ'],
          reponse: 'بَ',
          corrige: 'PIEGE_CORRIGE',
          enseignant: 'PIEGE_ENSEIGNANT',
        },
      ],
    } as never,
  ],
  dialogue: { repliques: [{ ar: 'سَلَامٌ', guide_enseignant_fr: 'PIEGE_GUIDE_ENS_FR' } as never] },
};

describe('audit CON-2 — projection élève par motif', () => {
  it('aucun piège ne passe, les réponses d’entraînement connues restent', () => {
    for (const P of [studentProjection(piege, 'en1'), parentProjection(piege, 'en1')]) {
      const s = JSON.stringify(P);
      expect(s.match(/PIEGE_[A-Z_]+/g) ?? []).toEqual([]);
      expect(s).toContain('note gardée');
      expect(s).toContain('"reponse":"بَ"'); // entraînement : corrigé hors ligne (comme le guide papier)
      expect(studentLeaks(P)).toEqual([]);
    }
  });

  it('import : chaque champ retiré est signalé (à vérifier sur les vrais livres)', () => {
    const issues = checkUnit('en1.l01', 'en1', piege, null, 'l01.js');
    const retires = issues.filter((i) => i.code === 'champ_retire_eleve');
    expect(retires.length).toBeGreaterThanOrEqual(10);
    expect(retires.every((i) => i.severity === 'avertissement')).toBe(true);
  });
});
