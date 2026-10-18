/**
 * Inscription par numéro WhatsApp (18/10/2026) — lecture des numéros (E.164), masquage, codes de vérification
 * « inversée » et codes de récupération.
 */
import { describe, expect, it } from 'vitest';
import {
  formaterCodeSecours,
  indicatifDe,
  lienWhatsapp,
  lireCodeDefi,
  masquerTelephone,
  normaliserCodeSecours,
  normaliserTelephone,
  ressembleTelephone,
} from '../src/telephone.js';

describe('numéros de téléphone', () => {
  it('Sénégal : forme nationale, internationale, 00, espaces ; mobile exigé', () => {
    for (const s of ['77 123 45 67', '+221 77 123 45 67', '00221771234567', '221771234567'])
      expect(normaliserTelephone(s, 'SN'), s).toEqual({
        ok: true,
        e164: '+221771234567',
        pays: 'SN',
      });
    expect(normaliserTelephone('+221 33 821 00 00')).toEqual({ ok: false, raison: 'mobile' });
    expect(normaliserTelephone('77 123 45 6', 'SN')).toEqual({ ok: false, raison: 'longueur' });
    expect(indicatifDe('SN')).toBe('221');
  });

  it('France : le 0 national tombe ; « +33 06 » corrigé ; fixe refusé', () => {
    expect(normaliserTelephone('06 12 34 56 78', 'FR')).toMatchObject({ e164: '+33612345678' });
    expect(normaliserTelephone('+33 06 12 34 56 78')).toMatchObject({ e164: '+33612345678' });
    expect(normaliserTelephone('01 23 45 67 89', 'FR')).toEqual({ ok: false, raison: 'mobile' });
  });

  it('indicatif hors table : règle générale E.164 ; forme nationale sans pays : refus', () => {
    expect(normaliserTelephone('+880 1712 345678')).toEqual({
      ok: true,
      e164: '+8801712345678',
      pays: null,
    });
    expect(normaliserTelephone('+1234')).toEqual({ ok: false, raison: 'longueur' });
    expect(normaliserTelephone('0612345678')).toEqual({ ok: false, raison: 'indicatif' });
    expect(normaliserTelephone('+33 6a')).toEqual({ ok: false, raison: 'format' });
    expect(normaliserTelephone('  ')).toEqual({ ok: false, raison: 'vide' });
  });

  it('masquage : indicatif et deux derniers chiffres seulement', () => {
    expect(masquerTelephone('+221771234567')).toBe('+221 ••••••• 67');
    expect(masquerTelephone('+33612345678')).toBe('+33 ••••••• 78');
    expect(masquerTelephone('pas un numéro')).toBeNull();
  });

  it('lien WhatsApp, code du message, codes de récupération, identifiant de connexion', () => {
    expect(lienWhatsapp('+221 70 000 00 00', 'AWZID 4F7K2Q')).toBe(
      'https://wa.me/221700000000?text=AWZID%204F7K2Q',
    );
    expect(lireCodeDefi('Bonjour Awzid, mon code : awzid 4f7k2q merci')).toBe('4F7K2Q');
    expect(lireCodeDefi('AWZID 4F7K2QX')).toBeNull();
    expect(lireCodeDefi('AWZID 0O1IL2')).toBeNull();
    expect(normaliserCodeSecours('4f7k2 q9xrt')).toBe('4F7K2Q9XRT');
    expect(normaliserCodeSecours('4F7K2-Q9XR')).toBeNull();
    expect(formaterCodeSecours('4F7K2Q9XRT')).toBe('4F7K2-Q9XRT');
    expect(ressembleTelephone('+221 77 123 45 67')).toBe(true);
    expect(ressembleTelephone('parent@exemple.fr')).toBe(false);
    expect(ressembleTelephone('parent')).toBe(false);
  });
});
