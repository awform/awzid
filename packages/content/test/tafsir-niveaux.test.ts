/**
 * Tafsīr du niveau — table de correspondance niveau → sourates (packages/content/src/tafsir-niveaux.ts, fichier de configuration
 * unique) : couverture des 114 sourates UNE fois et une seule, bornes validées par le client (Lawḥ v2), ordre à rebours, ce que le
 * parcours propose à chaque public (sa portion en premier, rien de fermé, enfants limités au juzʾ ʿAmma).
 */
import { describe, expect, it } from 'vitest';
import {
  niveauDeCode,
  niveauDeSourate,
  NIVEAUX_TAFSIR,
  proposerTafsir,
  souratesDuNiveau,
} from '../src/tafsir-niveaux.js';

describe('table des niveaux', () => {
  it('12 niveaux numérotés de 1 à 12, la table couvre les 114 sourates UNE fois et une seule', () => {
    expect(NIVEAUX_TAFSIR.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const toutes = NIVEAUX_TAFSIR.flatMap((x) => [...x.sourates]);
    expect(toutes).toHaveLength(114);
    expect(new Set(toutes).size).toBe(114);
    expect([...toutes].sort((a, b) => a - b)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
    for (const x of NIVEAUX_TAFSIR) expect(x.sourates.length, `N${x.n}`).toBeGreaterThan(0);
  });

  it('bornes validées par le client : N1 93-114 (+ al-Fātiḥa), N2 72-92, N3 58-71', () => {
    expect([...souratesDuNiveau(1)].sort((a, b) => a - b)).toEqual([
      1,
      ...Array.from({ length: 22 }, (_, i) => 93 + i),
    ]);
    expect(Math.min(...souratesDuNiveau(2))).toBe(72);
    expect(Math.max(...souratesDuNiveau(2))).toBe(92);
    expect(Math.min(...souratesDuNiveau(3))).toBe(58);
    expect(Math.max(...souratesDuNiveau(3))).toBe(71);
  });

  it('N4 à N12 : trois juzʾ chacun, à rebours, de N4 (juzʾ 27-25) à N12 (juzʾ 3-1) ; chaque niveau finit où commence le précédent', () => {
    let borne = 58;
    for (let n = 4; n <= 12; n++) {
      const s = [...souratesDuNiveau(n)];
      // contiguës : N4 juste sous 58, N5 juste sous N4, etc.
      expect(Math.max(...s), `N${n}`).toBe(borne - 1);
      borne = Math.min(...s);
    }
    expect(souratesDuNiveau(4)).toContain(57);
    expect(souratesDuNiveau(12)).toEqual([3, 2]);
    expect(NIVEAUX_TAFSIR[3]!.juz).toBe('juzʾ 27-25');
    expect(NIVEAUX_TAFSIR[11]!.juz).toBe('juzʾ 3-1');
  });

  it('ordre à rebours dans chaque niveau (al-Fātiḥa d’abord en N1, puis 114 → 93)', () => {
    expect(souratesDuNiveau(1).slice(0, 3)).toEqual([1, 114, 113]);
    expect(souratesDuNiveau(1).at(-1)).toBe(93);
    for (const n of [2, 3, 4, 7, 12]) {
      const s = souratesDuNiveau(n);
      expect(s, `N${n}`).toEqual([...s].sort((a, b) => b - a));
    }
  });

  it('niveauDeSourate et niveauDeCode', () => {
    expect([1, 114, 93, 92, 72, 71, 58, 57, 42, 41, 3, 2].map(niveauDeSourate)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 12, 12,
    ]);
    expect(niveauDeSourate(0)).toBeNull();
    expect(niveauDeSourate(115)).toBeNull();
    expect([
      niveauDeCode('ad1'),
      niveauDeCode('en3'),
      niveauDeCode('ado2'),
      niveauDeCode('ad10'),
    ]).toEqual([1, 3, 2, 10]);
    expect([
      niveauDeCode('re1'),
      niveauDeCode('ad13'),
      niveauDeCode(null),
      niveauDeCode(''),
    ]).toEqual([null, null, null, null]);
  });
});

describe('ce que le parcours propose', () => {
  it('un élève N1 voit sa portion (N1) proposée EN PREMIER, les onze autres restent ouvrables', () => {
    const p = proposerTafsir({ kind: 'adulte', levelCode: 'ad1' });
    expect(p.recommande).toBe(1);
    expect(p.niveaux[0]).toBe(1);
    expect(p.niveaux).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('un élève N2 : sa portion d’abord, mais N1 et N3 (et tous les autres) restent ouvrables ; jamais bloquant', () => {
    const p = proposerTafsir({ kind: 'adulte', levelCode: 'ad2' });
    expect(p.niveaux[0]).toBe(2);
    expect(p.niveaux).toContain(1);
    expect(p.niveaux).toContain(3);
    expect([...p.niveaux].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('sans niveau choisi ou niveau inconnu : N1 conseillé ; ado : comme l’adulte', () => {
    expect(proposerTafsir({ kind: 'adulte', levelCode: null }).recommande).toBe(1);
    expect(proposerTafsir({ kind: 'adulte', levelCode: 'zz9' }).recommande).toBe(1);
    expect(proposerTafsir({ kind: 'ado', levelCode: 'ado3' }).niveaux[0]).toBe(3);
  });

  it('un ENFANT : le juzʾ ʿAmma seulement (portion N1), quel que soit son niveau', () => {
    for (const levelCode of ['en1', 'en4', null])
      expect(proposerTafsir({ kind: 'enfant', levelCode })).toEqual({
        recommande: 1,
        niveaux: [1],
      });
  });
});
