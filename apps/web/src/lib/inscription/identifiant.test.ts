import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '$lib/countries';
import { deduirePays, lireIdentifiant, paysLePlusStrict } from './identifiant';

describe('champ unique : forme reconnue', () => {
  it('e-mail', () => {
    expect(lireIdentifiant(' fatou@exemple.org ')).toEqual({
      type: 'email',
      email: 'fatou@exemple.org',
    });
    expect(lireIdentifiant('fatou@exemple')).toEqual({ type: 'invalide', raison: 'email' });
  });
  it('numéro international (+ ou 00), pays lu depuis l’indicatif', () => {
    expect(lireIdentifiant('+221 77 123 45 67')).toEqual({
      type: 'telephone',
      e164: '+221771234567',
      pays: 'SN',
    });
    expect(lireIdentifiant('0033 6 12 34 56 78')).toMatchObject({
      type: 'telephone',
      e164: '+33612345678',
      pays: 'FR',
    });
  });
  it('messages : numéro sans indicatif, mauvais numéro, ni l’un ni l’autre, vide', () => {
    expect(lireIdentifiant('77 123 45 67')).toEqual({ type: 'invalide', raison: 'sans_indicatif' });
    expect(lireIdentifiant('+221 12')).toMatchObject({ type: 'invalide' });
    expect(lireIdentifiant('fatou')).toEqual({ type: 'invalide', raison: 'ni_l_un_ni_l_autre' });
    expect(lireIdentifiant('  ')).toEqual({ type: 'vide' });
  });
});

describe('pays déduit (jamais l’adresse IP)', () => {
  it('l’indicatif du numéro l’emporte', () => {
    expect(
      deduirePays({ numeroPays: 'SN', langue: 'fr-FR', fuseau: 'Europe/Paris' }, COUNTRIES),
    ).toMatchObject({ pays: 'SN', sur: true });
  });
  it('région de la langue, puis fuseau', () => {
    expect(deduirePays({ langue: 'fr-SN' }, COUNTRIES)).toMatchObject({ pays: 'SN', sur: true });
    expect(deduirePays({ langue: 'fr', fuseau: 'Africa/Dakar' }, COUNTRIES)).toMatchObject({
      pays: 'SN',
      sur: true,
    });
  });
  it('langue seule : supposition avec candidats', () => {
    const d = deduirePays({ langue: 'fr', fuseau: 'Asia/Tokyo' }, COUNTRIES);
    expect(d.sur).toBe(false);
    expect(d.candidats).toContain('SN');
    expect(d.candidats.every((c) => COUNTRIES.includes(c as never))).toBe(true);
  });
  it('règle la plus stricte parmi les candidats', () => {
    const ages: Record<string, number> = { FR: 15, SN: 13, BE: 13 };
    expect(paysLePlusStrict(['SN', 'FR', 'BE'], (c) => ages[c])).toBe('FR');
    expect(paysLePlusStrict(['SN', 'BE'], (c) => ages[c])).toBe('SN');
    expect(paysLePlusStrict(['XX'], () => undefined)).toBeNull();
  });
});
