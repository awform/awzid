import { describe, expect, it } from 'vitest';
import { carnetLabel, levelFitsProfile, levelLabel, levelParts } from './levels';

describe('libellés des niveaux (livres gelés ajoutés sans toucher à l’interface)', () => {
  it('codes des filières', () => {
    expect(levelParts('ado2')).toEqual({ track: 'ados', n: 2 });
    expect(levelParts('ad3')).toEqual({ track: 'adultes', n: 3 });
    expect(levelParts('en3')).toEqual({ track: 'enfants', n: 3 });
    expect(levelParts('ra1')).toEqual({ track: 'religion_ra', n: 1 });
    expect(levelParts('xx1')).toBeNull();
  });
  it('libellés', () => {
    expect(levelLabel('en3')).toBe('Enfants — niveau 3');
    expect(levelLabel('ado1')).toBe('Ados — niveau 1');
    expect(carnetLabel('ad3')).toBe('Carnet Adultes N3');
  });
  it('livres proposés selon le profil', () => {
    expect(levelFitsProfile('ado1', 'ado')).toBe(true);
    expect(levelFitsProfile('en3', 'enfant')).toBe(true);
    expect(levelFitsProfile('ad3', 'enfant')).toBe(false);
    expect(levelFitsProfile('ad3', 'adulte')).toBe(true);
    expect(levelFitsProfile('re1', 'adulte')).toBe(false);
  });
});
