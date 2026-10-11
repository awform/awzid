import { describe, expect, it } from 'vitest';
import { choisirEncre } from './brand-ink';

const PAIRE = { clair: '#084C38', sombre: '#E8DFC8' };

describe('marque : choix du symbole et de l’encre selon le fond réel', () => {
  it.each([
    ['#ffffff', false],
    ['#fbf7ee', false],
    ['#14261f', true],
    ['#22764f', true], // en-tête vert du thème « jardin » : le livre #0B6E4F s'y perdrait
    ['#0d1324', true],
  ])('fond %s : symbole sombre = %s', (fond, sombre) => {
    expect(choisirEncre(fond, PAIRE).fondSombre).toBe(sombre);
  });
  it('fond blanc : nom #084C38 ; fond sombre : nom #E8DFC8', () => {
    expect(choisirEncre('#ffffff', PAIRE).encre).toBe('#084C38');
    expect(choisirEncre('#14261f', PAIRE).encre).toBe('#E8DFC8');
  });
});
