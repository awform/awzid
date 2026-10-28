import { describe, expect, it } from 'vitest';
import { typoFr } from './typo-fr';

describe('typographie française à l’affichage', () => {
  it('fine insécable avant ; ! ? et dans les guillemets, insécable avant « : »', () => {
    expect(typoFr('Vraiment ? Oui !')).toBe('Vraiment ? Oui !');
    expect(typoFr('Antisèche : les mots')).toBe('Antisèche : les mots');
    expect(typoFr('Il dit « bonjour » à tous')).toBe('Il dit « bonjour » à tous');
  });
  it('un deux-points collé au mot suivant et un texte sans ponctuation ne changent pas', () => {
    expect(typoFr('12:30 et l’heure')).toBe('12:30 et l’heure');
    expect(typoFr('Mes phrases utiles')).toBe('Mes phrases utiles');
  });
  it('ne touche jamais un texte qui contient de l’arabe', () => {
    const ar = 'مَرْحَبًا ؟ « x » !';
    expect(typoFr(ar)).toBe(ar);
  });
});
