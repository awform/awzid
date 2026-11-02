import { describe, expect, it } from 'vitest';
import { normaliserPrenom, prenomValide, translitterer } from '@awform/school/eleves-lot';
import { baseIdentifiant, estIdentifiantEnfant, propositions } from '../src/auth/enfant-login.js';
import { pourFiche, texteWinAnsi } from '../src/pdf-fiche.js';

/** translittération latine à signes : l'identifiant n'a ni séparateur parasite ni lettre perdue */
describe('identifiant : prénoms en translittération latine avec signes', () => {
  it.each([
    ['Yūsuf', 'yusuf'],
    ['Yûsuf', 'yusuf'],
    ['ʿUmar', 'umar'],
    ['Ḥafṣa', 'hafsa'],
    ['Āmina', 'amina'],
    ['Ibrāhīm', 'ibrahim'],
    ['Khadîdja', 'khadidja'],
    ['Fâtima', 'fatima'],
    ['Zaynab', 'zaynab'],
    ['Ṣafiyya', 'safiyya'],
    ['Ḍiyāʾ', 'diya'],
    ['Ṭāhir', 'tahir'],
    ['Ẓāhir', 'zahir'],
    ['Yūsuf', 'yusuf'], // lettre + signe combinant (saisie décomposée)
    ['Ha\u0323san', 'hasan'],
  ])('%s → %s', (prenom, base) => {
    expect(prenomValide(prenom), prenom).toBe(true);
    expect(baseIdentifiant(prenom)).toBe(base);
    for (const p of propositions(prenom)) {
      expect(p).toMatch(new RegExp(`^${base}-\\d{3}$`));
      expect(estIdentifiantEnfant(p)).toBe(true);
    }
  });

  it('non-régression : prénoms arabes, peuls et français', () => {
    expect(baseIdentifiant('أمينة')).toBe('amina');
    expect(baseIdentifiant('موسى')).toBe('musa');
    expect(baseIdentifiant('Ɓaaba')).toBe('baaba');
    expect(baseIdentifiant('Ɗiko Ŋgoy Ƴaya')).toBe('diko-nggoy-yaya');
    expect(baseIdentifiant('Aïcha')).toBe('aicha');
    expect(baseIdentifiant('Jean-Éric Ndiaye')).toBe('jean-eric-ndiaye');
    expect(baseIdentifiant('李明')).toBe('enfant');
    expect(baseIdentifiant("N'Diaye")).toBe('ndiaye');
    expect(baseIdentifiant('‘Umar')).toBe('umar');
  });
});

describe('fiche PDF : prénoms en translittération latine avec signes', () => {
  it('translitterer ramène à la lettre de base, Latin-1 inchangé', () => {
    expect(translitterer(normaliserPrenom('Ḥafṣa'))).toBe('Hafsa');
    expect(translitterer(normaliserPrenom('ʿUmar'))).toBe('Umar');
    expect(translitterer('Aïcha')).toBe('Aïcha');
  });
  it.each(['Yūsuf', 'Ḥafṣa', 'ʿUmar', 'Āmina', 'Ibrāhīm', 'Ṣafiyya', 'Yûsuf', 'Khadîdja'])(
    '« %s » s’imprime sans refus',
    (prenom) => {
      expect(() => texteWinAnsi(pourFiche(prenom))).not.toThrow();
    },
  );
});
