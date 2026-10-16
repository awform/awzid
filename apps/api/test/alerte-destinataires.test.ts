/**
 * Lot 11 (chantier D) — plusieurs destinataires pour les alertes (AWFORM_ALERTE_A séparé par des virgules) : validation
 * de chaque adresse, un envoi par adresse, un échec n'empêche pas les autres.
 */
import { describe, expect, it } from 'vitest';
import { envoyerAChacun, lireDestinataires } from '../src/mail/alerte-destinataires.js';
import { memoryMailer, type Mailer } from '../src/mail/envoi.js';

const MSG = {
  kind: 'alerte',
  subject: '[Awzid] essai',
  text: 'corps',
  html: '<pre>corps</pre>',
} as const;

describe('AWFORM_ALERTE_A : une ou plusieurs adresses', () => {
  it('une adresse', () => {
    expect(lireDestinataires('awzid21@gmail.com')).toEqual({
      ok: true,
      adresses: ['awzid21@gmail.com'],
    });
  });
  it('deux adresses (espaces tolérés, doublons retirés)', () => {
    expect(lireDestinataires(' contact@awzid.com , awzid21@gmail.com,Contact@awzid.com ')).toEqual({
      ok: true,
      adresses: ['contact@awzid.com', 'awzid21@gmail.com'],
    });
  });
  it('une adresse invalide : refus clair, rien ne part', () => {
    expect(lireDestinataires('contact@awzid.com,awzid21-gmail.com')).toEqual({
      ok: false,
      raison: 'invalide',
      invalides: ['awzid21-gmail.com'],
    });
    expect(lireDestinataires('contact@awzid.com;awzid21@gmail.com')).toMatchObject({
      ok: false,
      raison: 'invalide',
    });
  });
  it('absent ou vide', () => {
    expect(lireDestinataires(undefined)).toEqual({ ok: false, raison: 'absent' });
    expect(lireDestinataires(' , ')).toEqual({ ok: false, raison: 'absent' });
  });
});

describe('envoi : un message par adresse', () => {
  it('deux adresses : deux envois séparés', async () => {
    const m = memoryMailer();
    const r = await envoyerAChacun(m, ['contact@awzid.com', 'awzid21@gmail.com'], MSG);
    expect(r).toEqual({ parties: ['contact@awzid.com', 'awzid21@gmail.com'], echecs: [] });
    expect(m.sent.map((x) => x.to)).toEqual(['contact@awzid.com', 'awzid21@gmail.com']);
  });
  it('un échec sur la première adresse n’empêche pas la seconde', async () => {
    const vus: string[] = [];
    const panne: Mailer = {
      mode: 'smtp',
      send: async (msg) => {
        if (msg.to === 'contact@awzid.com') throw new Error('550 boîte inconnue');
        vus.push(msg.to);
      },
    } as Mailer;
    const r = await envoyerAChacun(panne, ['contact@awzid.com', 'awzid21@gmail.com'], MSG);
    expect(r.parties).toEqual(['awzid21@gmail.com']);
    expect(r.echecs).toEqual([{ adresse: 'contact@awzid.com', erreur: '550 boîte inconnue' }]);
    expect(vus).toEqual(['awzid21@gmail.com']);
  });
});
