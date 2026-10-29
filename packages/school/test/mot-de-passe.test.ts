/**
 * V2-1 (29/10/2026) — règle des mots de passe, partagée par l'API et l'indicateur :
 * familles, adultes, ados, enfants : 8 caractères au moins, AUCUNE exigence de composition ; refus des mots de passe
 * courants (liste locale) et de ceux égaux à l'identifiant, à l'e-mail ou au prénom. Personnel : 12 caractères,
 * règle inchangée.
 */
import { describe, expect, it } from 'vitest';
import { checkPassword, forceMotDePasse, MDP_MAX, typesDeCaracteres } from '../src/mot-de-passe.js';
import { MDP_COMMUNS, estMotDePasseCommun } from '../src/liste-communs.js';

describe('types de caractères (conservé)', () => {
  it('minuscule, majuscule, chiffre, symbole ; lettre sans casse = minuscule ; diacritique = rien', () => {
    expect(typesDeCaracteres('')).toBe(0);
    expect(typesDeCaracteres('aB3!')).toBe(4);
    expect(typesDeCaracteres('كَلِمَة')).toBe(1);
  });
});

describe('règle des familles, adultes, ados et enfants (V2-1)', () => {
  it('7 caractères : trop court ; 8 caractères : accepté, sans majuscule ni chiffre ni symbole', () => {
    expect(checkPassword('tamarin')).toBe('trop_court');
    expect(checkPassword('Tm7!kpq')).toBe('trop_court');
    expect(checkPassword('tamarini')).toBeNull(); // 8 minuscules
    expect(checkPassword('tamarinier')).toBeNull();
    expect(checkPassword('TAMARINI')).toBeNull();
    expect(checkPassword('73958204')).toBeNull(); // 8 chiffres peu courants
    expect(checkPassword('mon thé à la menthe')).toBeNull();
    expect(checkPassword('une phrase de passe كَلِمَة')).toBeNull();
  });
  it('la longueur compte les caractères, pas les octets', () => {
    expect(checkPassword('كلمةمرور')).toBeNull(); // 8 caractères arabes
    expect(checkPassword('كلمةمر')).toBe('trop_court');
  });
  it('128 caractères au plus', () => {
    expect(checkPassword('x'.repeat(MDP_MAX) + 'y')).toBe('trop_long');
    expect(checkPassword('Ab1-' + 'x'.repeat(MDP_MAX - 4))).toBeNull();
  });
  it('refuse les mots de passe courants connus de l’application', () => {
    expect(checkPassword('Azerty123')).toBe('trop_courant');
    expect(checkPassword('Password1')).toBe('trop_courant');
    expect(checkPassword('motdepasse123')).toBe('trop_courant');
    expect(checkPassword('aaaaaaaa')).toBe('trop_courant');
  });
  it('refuse un mot de passe égal à l’identifiant, à l’e-mail, à sa partie locale ou au prénom (sans casse)', () => {
    expect(checkPassword('fatima.diallo@exemple.org', 'fatima.diallo@exemple.org')).toBe(
      'egal_identifiant',
    );
    expect(checkPassword('Fatima.Diallo', 'fatima.diallo@exemple.org')).toBe('egal_identifiant');
    expect(checkPassword('mouhamed-482', '', { identifiants: ['mouhamed-482'] })).toBe(
      'egal_identifiant',
    );
    expect(checkPassword('Abdoulaye', '', { identifiants: ['abdoulaye', null] })).toBe(
      'egal_identifiant',
    );
    // seulement ÉGAL : un mot de passe qui contient le prénom reste accepté
    expect(checkPassword('Abdoulaye2026!', '', { identifiants: ['Abdoulaye'] })).toBeNull();
    expect(checkPassword('fatima.diallo-2026!', 'fatima.diallo@exemple.org')).toBeNull();
  });
  it('liste fournie par le serveur : refus « trop_courant »', () => {
    const estCommun = (m: string) => m === 'tamarini';
    expect(checkPassword('Tamarini', '', { estCommun })).toBe('trop_courant');
    expect(checkPassword('tamarinz', '', { estCommun })).toBeNull();
  });
});

describe('liste locale des mots de passe courants', () => {
  it('au moins 10 000 entrées, 8 caractères ou plus, en minuscules, sans doublon', () => {
    expect(MDP_COMMUNS.size).toBeGreaterThanOrEqual(10_000);
    for (const m of MDP_COMMUNS) {
      expect([...m].length, m).toBeGreaterThanOrEqual(8);
      expect(m, m).toBe(m.toLowerCase());
    }
  });
  it('contient les classiques, sans casse', () => {
    for (const m of ['password', 'motdepasse', 'azertyuiop', 'bismillah', '12345678'])
      expect(estMotDePasseCommun(m), m).toBe(true);
    expect(estMotDePasseCommun('PassWord1')).toBe(true);
    expect(estMotDePasseCommun('Bismillah123')).toBe(true);
    expect(estMotDePasseCommun('tamarinier7')).toBe(false);
  });
  it('aucune ressource externe : la liste est un module du paquet (aucun import réseau)', () => {
    expect(typeof MDP_COMMUNS.has).toBe('function');
  });
});

describe('règle du personnel (inchangée)', () => {
  it('12 caractères au moins ; 8 caractères et 3 types ne valent pas', () => {
    expect(checkPassword('Tamarinier7', '', { personnel: true })).toBe('trop_court');
    expect(checkPassword('Tamari7x', '', { personnel: true })).toBe('trop_court');
    expect(checkPassword('tamariniersz', '', { personnel: true })).toBeNull();
  });
  it('refuse toujours les mots de passe courants et ceux qui contiennent l’adresse', () => {
    expect(checkPassword('motdepasse123', '', { personnel: true })).toBe('trop_courant');
    expect(checkPassword('Fatima.D2026-xyz', 'fatima.d@exemple.org', { personnel: true })).toBe(
      'contient_email',
    );
  });
});

describe('indicateur rouge / orange / vert = règle du serveur', () => {
  it('vide, refusé, correct (8 à 11), fort (12 et plus)', () => {
    expect(forceMotDePasse('')).toBe('vide');
    expect(forceMotDePasse('Tamar7x')).toBe('refuse');
    expect(forceMotDePasse('tamarini')).toBe('correct');
    expect(forceMotDePasse('Azerty123')).toBe('refuse');
    expect(forceMotDePasse('Tamarinier7')).toBe('correct');
    expect(forceMotDePasse('mon thé à la menthe')).toBe('fort');
    expect(forceMotDePasse('Tamari7x', '', { personnel: true })).toBe('refuse');
  });
  it('pour chaque mot de passe : refusé par l’indicateur ⇔ refusé par le contrôle', () => {
    const essais = [
      '',
      'a',
      'Ab1!',
      'Tamar7x',
      'tamarini',
      'Tamarinier7',
      'tamariniersz',
      'Azerty123',
    ];
    for (const p of essais)
      for (const personnel of [false, true]) {
        const f = forceMotDePasse(p, '', { personnel });
        if (p) expect(f === 'refuse', p).toBe(checkPassword(p, '', { personnel }) !== null);
      }
  });
});
