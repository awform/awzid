import { describe, expect, it } from 'vitest';
import type { LevelSummary } from './api';
import { pistesDeNiveaux, prefixeDe, PISTES_CONNUES } from './explorer';

/**
 * Mode exploration du compte « tout voir » : tous les niveaux de toutes les pistes, sans verrou de progression, de
 * positionnement, d'épreuve ni d'âge (la liste ne dépend ni d'un profil ni d'un âge : elle n'en reçoit aucun).
 */
const niveau = (code: string, units = 3, apercu = false): LevelSummary => ({
  code,
  track: '',
  rank: 0,
  titleFr: null,
  codeFr: null,
  niveauFr: null,
  titreAr: null,
  units,
  ...(apercu ? { apercu } : {}),
});
const CODES = [
  'ad10',
  'ad2',
  'ad1',
  'ado3',
  'ado1',
  'en2',
  'en1',
  'en10',
  're1',
  're2',
  'ra1',
  'ra2',
  'qc1',
  'qc3',
  'zz1',
  'bizarre',
];

describe('pistesDeNiveaux : exploration de toutes les pistes', () => {
  const pistes = pistesDeNiveaux(CODES.map((c) => niveau(c)));

  it('toutes les pistes connues sont listées, dans l’ordre, plus « autres » en dernier', () => {
    expect(pistes.map((p) => p.id)).toEqual(['en', 'ado', 'ad', 're', 'ra', 'qc', 'autres']);
    expect(pistes.map((p) => p.filiere)).toEqual([
      'enfants',
      'ados',
      'adultes',
      'religion',
      'religion_ra',
      'coran',
      null,
    ]);
    expect(PISTES_CONNUES.map((p) => p.prefixe)).toEqual(['en', 'ado', 'ad', 're', 'ra', 'qc']);
  });

  it('chaque niveau figure UNE fois, aucun n’est caché (enfants, ados, adultes, religion, Coran, inconnus)', () => {
    const codes = pistes.flatMap((p) => p.niveaux.map((n) => n.code));
    expect(codes.sort()).toEqual([...CODES].sort());
    expect(new Set(codes).size).toBe(CODES.length);
  });

  it('tri naturel dans chaque piste (ad1, ad2, ad10)', () => {
    expect(pistes.find((p) => p.id === 'ad')!.niveaux.map((n) => n.code)).toEqual([
      'ad1',
      'ad2',
      'ad10',
    ]);
    expect(pistes.find((p) => p.id === 'en')!.niveaux.map((n) => n.code)).toEqual([
      'en1',
      'en2',
      'en10',
    ]);
  });

  it('une piste vide n’apparaît pas ; liste vide : aucune piste ; un livre en aperçu est gardé', () => {
    expect(pistesDeNiveaux([])).toEqual([]);
    expect(pistesDeNiveaux([niveau('qc1')]).map((p) => p.id)).toEqual(['qc']);
    expect(pistesDeNiveaux([niveau('ad4', 0, true)])[0]!.niveaux[0]!.apercu).toBe(true);
  });

  it('prefixeDe', () => {
    expect(prefixeDe('ado12')).toBe('ado');
    expect(prefixeDe('qc1')).toBe('qc');
    expect(prefixeDe('bizarre')).toBeNull();
  });
});
