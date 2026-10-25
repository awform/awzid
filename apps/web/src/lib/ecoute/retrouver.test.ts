import { describe, expect, it } from 'vitest';
import { cartes, requeteLecteur, RECITATEUR_RETROUVER } from './retrouver';

/** « Retrouve ce verset » : ce que montre l'écran à partir de la réponse du serveur. */
describe('Retrouve ce verset : cartes de l’écran', () => {
  it('un passage retrouvé : une carte, du premier au dernier verset couvert', () => {
    const v = cartes({
      statut: 'trouve',
      resultats: [{ verset: '41:4', passage: ['41:3', '41:4'], score: 0.95 }],
      egaux: [],
    });
    expect(v.principales).toEqual([{ s: 41, a: 3, a1: 4, principal: 4 }]);
    expect(v.autres).toEqual([]);
  });

  it('passage à cheval sur deux sourates : la carte reste dans la sourate du verset principal', () => {
    const v = cartes({
      statut: 'trouve',
      resultats: [{ verset: '2:1', passage: ['1:7', '2:1'], score: 0.9 }],
      egaux: [],
    });
    expect(v.principales).toEqual([{ s: 2, a: 1, a1: 1, principal: 1 }]);
  });

  it('texte identique ailleurs : TOUS les versets ex æquo, puis les autres possibles sans doublon', () => {
    const v = cartes({
      statut: 'trouve',
      resultats: [
        { verset: '6:151', passage: ['6:151'], score: 0.9 },
        { verset: '17:33', passage: ['17:33'], score: 0.9 },
        { verset: '25:68', passage: ['25:68'], score: 0.7 },
      ],
      egaux: ['6:151', '17:33'],
    });
    expect(v.principales.map((c) => `${c.s}:${c.principal}`)).toEqual(['6:151', '17:33']);
    expect(v.autres.map((c) => `${c.s}:${c.principal}`)).toEqual(['25:68']);
  });

  it('rien de sûr, ou trop court : aucune carte', () => {
    expect(cartes({ statut: 'pas_trouve', resultats: [], egaux: [] }).principales).toEqual([]);
    expect(cartes({ statut: 'trop_court', resultats: [], egaux: [] }).principales).toEqual([]);
  });

  it('un toucher ouvre le passage dans le lecteur, lu par Muḥammad Ayyūb', () => {
    expect(RECITATEUR_RETROUVER).toBe('ayyoub-hafs');
    expect(requeteLecteur({ s: 41, a: 3, a1: 4, principal: 4 })).toBe(
      '?s=41&a=3&r=ayyoub-hafs&lire=1',
    );
  });
});
