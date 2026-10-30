import { describe, expect, it } from 'vitest';
import { assezVisible } from './demarrage';

describe('départ automatique des leçons vivantes', () => {
  it('petite animation : 60 % visibles suffisent, 50 % non', () => {
    expect(assezVisible({ top: 100, bottom: 400 }, 700)).toBe(true);
    expect(assezVisible({ top: 550, bottom: 850 }, 700)).toBe(false); // 150/300
    expect(assezVisible({ top: 520, bottom: 820 }, 700)).toBe(true); // 180/300
  });
  it('animation plus haute que la fenêtre (Chrome ordinateur) : démarre quand elle remplit 60 % de la fenêtre', () => {
    // 1200 px de haut dans 650 px : l'ancien ratio de 0,6 (720 px) était inatteignable
    expect(assezVisible({ top: -200, bottom: 1000 }, 650)).toBe(true);
    expect(assezVisible({ top: 400, bottom: 1600 }, 650)).toBe(false); // 250 visibles < 390
  });
  it('barre de navigation du téléphone retirée de la zone utile ; hauteur nulle : jamais', () => {
    expect(assezVisible({ top: 400, bottom: 700 }, 700, 96)).toBe(true); // zone utile 604 px : 204 visibles >= 180
    expect(assezVisible({ top: 500, bottom: 800 }, 700, 96)).toBe(false); // 104 visibles < 180
    expect(assezVisible({ top: 0, bottom: 0 }, 700)).toBe(false);
  });
});
