/**
 * Lot 11 — règle des mots de passe (décision du client du 16/10/2026), partagée par l'API et l'indicateur :
 * familles et adultes : (≥ 8 caractères ET 3 types sur 4) OU ≥ 12 caractères ; personnel : ≥ 12 caractères.
 */
import { describe, expect, it } from 'vitest';
import { checkPassword, forceMotDePasse, MDP_MAX, typesDeCaracteres } from '../src/mot-de-passe.js';

describe('types de caractères', () => {
  it('minuscule, majuscule, chiffre, symbole ; lettre sans casse = minuscule ; diacritique = rien', () => {
    expect(typesDeCaracteres('')).toBe(0);
    expect(typesDeCaracteres('abc')).toBe(1);
    expect(typesDeCaracteres('aBc')).toBe(2);
    expect(typesDeCaracteres('aB3')).toBe(3);
    expect(typesDeCaracteres('aB3!')).toBe(4);
    expect(typesDeCaracteres('a b')).toBe(2); // l'espace est un symbole
    expect(typesDeCaracteres('كلمة')).toBe(1);
    expect(typesDeCaracteres('كَلِمَة')).toBe(1); // les ḥarakāt ne comptent pas comme symbole
    expect(typesDeCaracteres('١٢٣')).toBe(1); // chiffres arabo-indiens
    expect(typesDeCaracteres('Éé')).toBe(2);
  });
});

describe('règle des familles et adultes', () => {
  it('7 caractères : toujours trop court, même avec 4 types', () => {
    expect(checkPassword('Tm7!kpq')).toBe('trop_court');
    expect(checkPassword('Tamar7x')).toBe('trop_court');
  });
  it('8 caractères : accepté avec 3 types, refusé avec 2', () => {
    expect(checkPassword('Tamari7x')).toBeNull(); // minuscule, majuscule, chiffre
    expect(checkPassword('tamari7!')).toBeNull(); // minuscule, chiffre, symbole
    expect(checkPassword('Tamarixz')).toBe('trop_simple'); // 2 types
    expect(checkPassword('tamari7x')).toBe('trop_simple'); // 2 types
  });
  it('11 caractères : encore 3 types exigés', () => {
    expect(checkPassword('tamarinier7')).toBe('trop_simple');
    expect(checkPassword('Tamarinier7')).toBeNull();
    expect(checkPassword('tamarinierz')).toBe('trop_simple');
  });
  it('12 caractères : une phrase suffit, sans autre contrainte', () => {
    expect(checkPassword('tamariniersz')).toBeNull();
    expect(checkPassword('mon thé à la menthe')).toBeNull();
    expect(checkPassword('une phrase de passe كَلِمَة')).toBeNull();
  });
  it('contrôles gardés : courant, répétition, suite, adresse, longueur maximale', () => {
    expect(checkPassword('Azerty123')).toBe('trop_courant');
    expect(checkPassword('Password1')).toBe('trop_courant');
    expect(checkPassword('motdepasse123')).toBe('trop_courant');
    expect(checkPassword('aaaaaaaaaaaaaaa')).toBe('trop_courant');
    expect(checkPassword('123456789012345')).toBe('trop_courant');
    expect(checkPassword('Fatima.D2026', 'fatima.d@exemple.org')).toBe('contient_email');
    expect(checkPassword('x'.repeat(MDP_MAX) + 'y')).toBe('trop_long');
    expect(checkPassword('Ab1-' + 'x'.repeat(MDP_MAX - 4))).toBeNull();
  });
  it('la longueur compte les caractères, pas les octets', () => {
    expect(checkPassword('كلمةمرور٧Aب')).toBeNull(); // 11 caractères, 3 types
    expect(checkPassword('كلمةمرورسهل')).toBe('trop_simple'); // 11 caractères, 1 type
  });
});

describe('règle du personnel', () => {
  it('12 caractères au moins, la voie « 8 et 3 types » ne vaut pas', () => {
    expect(checkPassword('Tamarinier7', '', { personnel: true })).toBe('trop_court');
    expect(checkPassword('Tamari7x', '', { personnel: true })).toBe('trop_court');
    expect(checkPassword('tamariniersz', '', { personnel: true })).toBeNull();
  });
});

describe('indicateur rouge / orange / vert = règle du serveur', () => {
  it('vide, refusé, correct (8 à 11 et 3 types), fort (12 et plus)', () => {
    expect(forceMotDePasse('')).toBe('vide');
    expect(forceMotDePasse('Tamar7x')).toBe('refuse');
    expect(forceMotDePasse('Tamarixz')).toBe('refuse');
    expect(forceMotDePasse('Azerty123')).toBe('refuse');
    expect(forceMotDePasse('Tamari7x')).toBe('correct');
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
      'Tamari7x',
      'tamari7x',
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
