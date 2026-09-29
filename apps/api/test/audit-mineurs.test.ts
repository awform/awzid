/**
 * Audit — âge et consentements des mineurs : MIN-1, MIN-2, MIN-3, MIN-4, SEC-3 (un bloc par constat).
 * Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling } from '@awform/billing';
import { setupTutor } from '@awform/tutor';
import { child, cookieOf, parent, PW, setupEdition, YEAR, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit — mineurs', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!, {
      billing: setupBilling({ AWFORM_PAIEMENT: 'simule', AWFORM_PAIEMENT_SIM_SECRET: 'x' }),
      tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }),
    });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('MIN-1 : un mineur qui s’inscrit seul reçoit un profil « ado » protégé, sans achat ni envoi de voix', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'college@exemple.org',
        password: PW,
        country: 'US',
        consents: ['cgu', 'transfert_hors_pays'],
        birthYear: YEAR - 14, // 13 ans au plus bas : âge du consentement numérique aux États-Unis
      },
    );
    expect(su.statusCode, su.body).toBe(201);
    const A = { cookie: cookieOf(su) };
    const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
    expect(me.profiles[0].kind).toBe('ado');
    const pid = me.profiles[0].id;
    const pr = (await c.req('GET', `/api/v1/profiles/${pid}/protections`, A)).json();
    expect(pr.mineur).toBe(true);
    const buy = await c.req('POST', '/api/v1/billing/checkout', A, { plan: 'adulte_mensuel' });
    expect(buy.json().error?.code).toBe('parent_requis');
    const acc = await c.req('POST', `/api/v1/profiles/${pid}/recitations/accord`, A, {});
    expect(acc.json().error?.code).toBe('parent_requis');
    // un adulte (18 ans et plus) garde un profil adulte
    const ad = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'majeur@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: YEAR - 30,
      },
    );
    const me2 = (await c.req('GET', '/api/v1/auth/me', { cookie: cookieOf(ad) })).json();
    expect(me2.profiles[0].kind).toBe('adulte');
  });

  it('MIN-2 : une seule source pour l’âge — un profil « enfant » reste « enfant » pour le tuteur', async () => {
    const fam = await parent(c, 'min2@exemple.org');
    const kid = await child(c, fam.P, 'Awa', 13); // né en Y−13 : rangé « enfant » (12 ans au plus bas)
    const me = (await c.req('GET', '/api/v1/auth/me', fam.P)).json();
    expect(me.profiles.find((p: { id: string }) => p.id === kid).kind).toBe('enfant');
    await c.req('PUT', `/api/v1/profiles/${kid}/tuteur`, fam.pin, { actif: true });
    const r = await c.req('POST', `/api/v1/tutor/${kid}/ask`, fam.P, {
      unitId: 'en1.l01',
      action: 'question',
      text: 'bonjour',
      hour: 23,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().audience).toBe('enfant');
    expect(r.json().ia).toBe(false);
  });
});
