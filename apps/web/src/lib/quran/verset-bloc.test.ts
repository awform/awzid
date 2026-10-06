import { describe, expect, it } from 'vitest';
import { splitVerseRef } from './verset-bloc';

describe('splitVerseRef — référence et traduction sur deux lignes', () => {
  it('référence écrite par le livre à la fin de la traduction', () => {
    expect(
      splitVerseRef(
        '« Et il ne leur a été ordonné… » (Al-Bayyina 98:5, extrait).',
        { s: 98, a: 5 },
        'Al-Bayyina',
      ),
    ).toEqual({ ref: 'Al-Bayyina 98:5, extrait', sens: '« Et il ne leur a été ordonné… »' });
  });
  it('sans référence dans le texte : nom de la sourate et numéros calculés', () => {
    expect(splitVerseRef('« Allah aime… »', { s: 2, a: 222 }, 'Al-Baqara')).toEqual({
      ref: 'Al-Baqara 2:222',
      sens: '« Allah aime… »',
    });
    expect(splitVerseRef('x', { s: 1, a: 1, a2: 2 }, 'Al-Fātiḥa').ref).toBe('Al-Fātiḥa 1:1-2');
  });
  it('référence d’un AUTRE verset à la fin : laissée dans le texte', () => {
    expect(splitVerseRef('… péché (17:36).', { s: 16, a: 43 }, 'An-Naḥl')).toEqual({
      ref: 'An-Naḥl 16:43',
      sens: '… péché (17:36).',
    });
  });
  it('passage ambigu (sans référence) : aucune référence inventée', () => {
    expect(splitVerseRef('Sens.', {}, '')).toEqual({ ref: '', sens: 'Sens.' });
  });
});
