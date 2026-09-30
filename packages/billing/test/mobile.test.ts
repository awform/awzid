/** Complément E — mobile money SIMULÉ : signature horodatée, montant notifié, francs CFA seulement. */
import { describe, expect, it } from 'vitest';
import {
  mobileSignatureHeader,
  SimulatedMobileMoneyProvider,
  verifyMobileSignature,
} from '../src/providers/mobile-simule.js';

const SECRET = Buffer.alloc(32, 7);
const input = {
  checkoutId: '00000000-0000-4000-8000-000000000001',
  plan: 'pass_3_mois' as const,
  montant: 3500,
  devise: 'XOF' as const,
  renouvelable: false,
  periodeMois: 3,
  retour: { succes: '/a', abandon: '/b' },
};

describe('signature des notifications', () => {
  it('vérifiée : juste, corps modifié, autre secret, en-tête illisible', () => {
    const now = Date.parse('2026-09-30T10:00:00Z');
    const h = mobileSignatureHeader(SECRET, '{"a":1}', now);
    expect(h).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(() => verifyMobileSignature(SECRET, h, '{"a":1}', now)).not.toThrow();
    expect(() => verifyMobileSignature(SECRET, h, '{"a":2}', now)).toThrow('signature_invalide');
    expect(() => verifyMobileSignature(Buffer.alloc(32, 8), h, '{"a":1}', now)).toThrow(
      'signature_invalide',
    );
    expect(() => verifyMobileSignature(SECRET, 'n’importe quoi', '{}', now)).toThrow(
      'signature_invalide',
    );
    expect(() => verifyMobileSignature(SECRET, undefined, '{}', now)).toThrow('signature_invalide');
  });
  it('horodatage : rejouée après 5 minutes → périmée ; dans la tolérance → acceptée', () => {
    const t0 = Date.parse('2026-09-30T10:00:00Z');
    const h = mobileSignatureHeader(SECRET, 'x', t0);
    expect(() => verifyMobileSignature(SECRET, h, 'x', t0 + 299_000)).not.toThrow();
    expect(() => verifyMobileSignature(SECRET, h, 'x', t0 + 301_000)).toThrow('signature_perimee');
    expect(() => verifyMobileSignature(SECRET, h, 'x', t0 - 301_000)).toThrow('signature_perimee');
  });
});

describe('prestataire mobile money simulé', () => {
  const p = new SimulatedMobileMoneyProvider('secret-de-test');
  it('commande : francs CFA entiers seulement', async () => {
    expect(await p.createCheckout(input)).toEqual({
      url: `/abonnement/paiement-simule/${input.checkoutId}`,
      reference: `mm_sim_${input.checkoutId}`,
    });
    await expect(p.createCheckout({ ...input, devise: 'EUR', montant: 599 })).rejects.toThrow(
      'devise_non_prise_en_charge',
    );
    await expect(p.createCheckout({ ...input, montant: 0 })).rejects.toThrow();
  });
  it('notification → événement : opérateur, transaction, montant et devise notifiés', async () => {
    const n = p.notification(input.checkoutId, {
      type: 'paiement_reussi',
      operateur: 'wave',
      montant: 3500,
      devise: 'XOF',
      transactionId: 'T1',
    });
    expect(await p.parseWebhook(n.headers, n.body)).toEqual({
      provider: 'mobile_money',
      eventId: 'wave:T1',
      type: 'paiement_reussi',
      checkoutId: input.checkoutId,
      reference: `mm_sim_${input.checkoutId}`,
      montant: 3500,
      devise: 'XOF',
    });
    const e = p.notification(input.checkoutId, {
      type: 'paiement_echoue',
      operateur: 'orange_money',
      montant: 3500,
      devise: 'XOF',
    });
    expect((await p.parseWebhook(e.headers, e.body))?.type).toBe('paiement_echoue');
    // signée par un autre secret (autre instance) : refusée
    const other = new SimulatedMobileMoneyProvider('autre');
    await expect(other.parseWebhook(n.headers, n.body)).rejects.toThrow('signature_invalide');
  });
  it('opérateur inconnu, correctement signé : ignoré ; corps modifié : refusé', async () => {
    const n = p.notification(input.checkoutId, {
      type: 'paiement_reussi',
      operateur: 'inconnu' as 'wave',
      montant: 3500,
      devise: 'XOF',
    });
    expect(await p.parseWebhook(n.headers, n.body)).toBeNull();
    await expect(p.parseWebhook(n.headers, n.body.replace('3500', '100'))).rejects.toThrow(
      'signature_invalide',
    );
  });
});
