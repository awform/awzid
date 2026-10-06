import { describe, expect, it } from 'vitest';
import {
  annotateVerses,
  buildVerseLocator,
  locateVerse,
  quoteBounds,
  VERSE_FIELD,
  verseRefs,
} from '../src/versets.js';

/**
 * Repérage des versets cités dans les points des leçons. Corpus SYNTHÉTIQUE (phrases ordinaires, aucun texte
 * religieux) qui joue le rôle du texte Tanzil : seules les règles de correspondance sont testées ici ; le cas
 * réel (ad1, leçon 1 : al-Bayyina 98:5) est vérifié sur les vrais livres (api, e2e).
 */
const ROWS = [
  { s: 1, a: 1, text: 'ذَهَبَ ٱلْوَلَدُ إِلَى ٱلْمَدْرَسَةِ' },
  { s: 1, a: 2, text: 'ثُمَّ رَجَعَ إِلَى ٱلْبَيْتِ مَسْرُورًۭا' },
  { s: 2, a: 1, text: 'قَرَأَ ٱلْوَلَدُ كِتَابًۭا جَمِيلًۭا' },
  { s: 2, a: 2, text: 'ذَهَبَ ٱلْوَلَدُ إِلَى ٱلسُّوقِ' },
  { s: 3, a: 1, text: 'كَتَبَ ٱلْوَلَدُ دَرْسَهُۥ' },
  { s: 3, a: 2, text: 'ذَهَبَ ٱلْوَلَدُ' },
];
const loc = buildVerseLocator(ROWS);

describe('versets cités dans les points (correspondance exacte avec le texte Tanzil)', () => {
  it('verset entier ou extrait, guillemets et parenthèses écartés : reconnu, sous-chaîne exacte', () => {
    const ar = '« ثُمَّ رَجَعَ إِلَى ٱلْبَيْتِ مَسْرُورًۭا »';
    const m = locateVerse(loc, ar);
    expect(m).toMatchObject({ s: 1, a: 2 });
    expect(ar.slice(m!.i, m!.j)).toBe('ثُمَّ رَجَعَ إِلَى ٱلْبَيْتِ مَسْرُورًۭا');
    expect(locateVerse(loc, 'رَجَعَ إِلَى ٱلْبَيْتِ')).toMatchObject({ s: 1, a: 2 }); // extrait
    expect(locateVerse(loc, '(كَتَبَ ٱلْوَلَدُ دَرْسَهُۥ).')).toMatchObject({ s: 3, a: 1 });
  });

  it('passage sur deux versets consécutifs d’une même sourate', () => {
    expect(locateVerse(loc, 'ٱلْمَدْرَسَةِ ثُمَّ رَجَعَ')).toMatchObject({ s: 1, a: 1, a2: 2 });
    // fin de sourate 1 → début de sourate 2 : non
    expect(locateVerse(loc, 'مَسْرُورًۭا قَرَأَ ٱلْوَلَدُ')).toBeNull();
  });

  it('hadith ou phrase en écriture courante (octets différents) : jamais un verset', () => {
    // même phrase, orthographe courante (ا au lieu de ٱ, tanwin ordinaire) : ce n'est pas le texte Tanzil
    expect(locateVerse(loc, 'ثُمَّ رَجَعَ إِلَى الْبَيْتِ مَسْرُورًا')).toBeNull();
    expect(locateVerse(loc, 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ')).toBeNull();
    expect(locateVerse(loc, 'أَكَلَ الْوَلَدُ تُفَّاحَةً')).toBeNull();
  });

  it('mots entiers seulement ; un mot isolé n’est jamais un verset', () => {
    expect(locateVerse(loc, 'لْوَلَدُ إِلَى ٱلْمَدْرَسَةِ')).toBeNull(); // début de mot coupé
    expect(locateVerse(loc, 'ٱلْمَدْرَسَةِ')).toBeNull();
  });

  it('deux mots : seulement si le point donne la référence', () => {
    expect(locateVerse(loc, 'كِتَابًۭا جَمِيلًۭا')).toBeNull();
    expect(locateVerse(loc, 'كِتَابًۭا جَمِيلًۭا', 'un beau livre (2:1)')).toMatchObject({
      s: 2,
      a: 1,
    });
  });

  it('passage ambigu : la référence du livre tranche, sinon le verset entier, sinon aucune référence', () => {
    // « ذَهَبَ ٱلْوَلَدُ إِلَى » : 1:1 et 2:2
    expect(locateVerse(loc, 'ذَهَبَ ٱلْوَلَدُ إِلَى', 'Récit (2:2, extrait).')).toMatchObject({
      s: 2,
      a: 2,
    });
    const m = locateVerse(loc, 'ذَهَبَ ٱلْوَلَدُ إِلَى');
    expect(m).not.toBeNull();
    expect(m!.s).toBeUndefined(); // jamais de référence inventée
    // « ذَهَبَ ٱلْوَلَدُ » : 1:1, 2:2 (extraits) et 3:2 (verset entier) → 3:2 ; mais 2 mots sans référence → non
    expect(locateVerse(loc, 'ذَهَبَ ٱلْوَلَدُ')).toBeNull();
    expect(locateVerse(loc, 'ذَهَبَ ٱلْوَلَدُ', '(3:2)')).toMatchObject({ s: 3, a: 2 });
  });

  it('annotation d’une leçon : blocs d’affichage seulement, texte du livre inchangé', () => {
    const lesson = {
      fiqh_adab: {
        points: [
          { ar: 'قَرَأَ ٱلْوَلَدُ كِتَابًۭا جَمِيلًۭا', fr: '« … » (2:1).' },
          { ar: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ', fr: 'Hadith.' },
          { ar: 'أَكَلَ الْوَلَدُ تُفَّاحَةً', fr: 'Phrase.' },
        ],
      },
      retiens: [{ ar: 'كَتَبَ ٱلْوَلَدُ دَرْسَهُۥ', fr: '…' }],
      exercices: [{ items: [{ ar: 'قَرَأَ ٱلْوَلَدُ كِتَابًۭا جَمِيلًۭا' }] }],
      coran: { versets: [{ ar: 'قَرَأَ ٱلْوَلَدُ كِتَابًۭا جَمِيلًۭا' }] },
    };
    const before = JSON.stringify(lesson);
    expect(annotateVerses(lesson, loc)).toBe(2);
    const pts = lesson.fiqh_adab.points as Array<Record<string, unknown>>;
    expect(pts[0]![VERSE_FIELD]).toMatchObject({ s: 2, a: 1 });
    expect(pts[1]![VERSE_FIELD]).toBeUndefined();
    expect(pts[2]![VERSE_FIELD]).toBeUndefined();
    expect((lesson.exercices[0]!.items[0] as Record<string, unknown>)[VERSE_FIELD]).toBeUndefined();
    expect((lesson.coran.versets[0] as Record<string, unknown>)[VERSE_FIELD]).toBeUndefined();
    // seules les marques ont été ajoutées
    const strip = JSON.parse(JSON.stringify(lesson), (k, v: unknown) =>
      k === VERSE_FIELD ? undefined : v,
    );
    expect(JSON.stringify(strip)).toBe(before);
    expect(annotateVerses(lesson, null)).toBe(0);
  });

  it('outils : bornes de citation et références', () => {
    expect(quoteBounds('« … أَبْ تَثْ »')).toEqual([4, 13]);
    expect(verseRefs('(Al-Bayyina 98:5, extrait) ; 2:1-3 ; 200:1')).toEqual([
      { s: 98, a: 5, a2: 5 },
      { s: 2, a: 1, a2: 3 },
    ]);
  });
});
