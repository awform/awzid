/**
 * Audit PAY-4 : avec AWFORM_DROITS=on, les droits sont APPLIQUÉS au contenu (leçons au-delà de l'offre
 * gratuite, paquet hors ligne) ; avec off (défaut), tout le catalogue publié reste ouvert.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling } from '@awform/billing';
import { adult, PW, setup, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const UNITS = [
  { id: 'en1.l01', n: 1 },
  { id: 'en1.l07', n: 7 },
];

describe.skipIf(!URL_)('audit PAY-4 — droits appliqués', () => {
  let on: Ctx;
  let off: Ctx['app'];
  beforeAll(async () => {
    on = await setup(URL_!, UNITS, {
      billing: setupBilling({
        AWFORM_PAIEMENT: 'simule',
        AWFORM_PAIEMENT_SIM_SECRET: 'x',
        AWFORM_DROITS: 'on',
      }),
    });
    const { buildApp } = await import('../src/app.js');
    const { randomBytes } = await import('node:crypto');
    off = buildApp({
      db: on.h.db,
      secretKey: randomBytes(32),
      relaisCertsDir: null,
      billing: setupBilling({ AWFORM_PAIEMENT: 'simule', AWFORM_PAIEMENT_SIM_SECRET: 'x' }),
    });
    await off.ready();
  });
  afterAll(async () => {
    await off?.close();
    await on?.app.close();
    await on?.h.close();
  });

  it('gratuit : 5 premières leçons seulement, pas de paquet hors ligne ; abonné : tout', async () => {
    const { A } = await adult(on, 'pay4@exemple.org');
    expect((await on.req('GET', '/api/v1/units/en1.l01', A)).statusCode).toBe(200);
    const l7 = await on.req('GET', '/api/v1/units/en1.l07', A);
    expect(l7.statusCode).toBe(403);
    expect(l7.json().error.code).toBe('droits_insuffisants');
    expect((await on.req('GET', '/api/v1/units/en1.l07')).statusCode).toBe(403); // anonyme
    expect((await on.req('GET', '/api/v1/packs/en1', A)).json().error?.code).toBe(
      'hors_ligne_reserve',
    );
    // droits off (défaut) : même compte, tout est ouvert
    const cookie = A.cookie;
    const o = await off.inject({
      method: 'GET',
      url: '/api/v1/units/en1.l07',
      headers: { cookie },
    });
    expect(o.statusCode).toBe(200);
    // abonnement payé : tout s'ouvre
    const co = (
      await on.req('POST', '/api/v1/billing/checkout', A, {
        plan: 'adulte_mensuel',
        motDePasse: PW,
      })
    ).json();
    await on.req('POST', `/api/v1/billing/simulate/${co.checkoutId}`, A, { resultat: 'succes' });
    expect((await on.req('GET', '/api/v1/units/en1.l07', A)).statusCode).toBe(200);
    expect((await on.req('GET', '/api/v1/packs/en1', A)).statusCode).not.toBe(403);
    // enseignant : tout le contenu
    const T = await teacher(on, 'prof-pay4@exemple.org');
    expect((await on.req('GET', '/api/v1/units/en1.l07', T)).statusCode).toBe(200);
  });
});
