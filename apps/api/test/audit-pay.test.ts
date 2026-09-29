/**
 * Audit — paiements : PAY-1, PAY-2, PAY-3, PAY-4 (un bloc par constat). Prestataire SIMULÉ, aucune carte.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling } from '@awform/billing';
import { adult, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const SECRET = 'secret-de-test-pay';

describe.skipIf(!URL_)('audit — paiements', () => {
  let c: Ctx;
  const billing = setupBilling({ AWFORM_PAIEMENT: 'simule', AWFORM_PAIEMENT_SIM_SECRET: SECRET });
  beforeAll(async () => {
    c = await setupEdition(URL_!, { billing });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  /** événement signé du prestataire simulé, envoyé au webhook */
  const webhook = (checkoutId: string, type: 'paiement_reussi' | 'paiement_echoue') => {
    const e = billing.simulated.event(checkoutId, type);
    return c.app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhook/simule',
      headers: { ...e.headers, 'content-type': 'application/json' },
      payload: e.body,
    });
  };

  it('PAY-1 : un paiement, un seul abonnement — même avec 8 validations simultanées', async () => {
    const { A } = await adult(c, 'pay1@exemple.org');
    const co = (
      await c.req('POST', '/api/v1/billing/checkout', A, { plan: 'adulte_mensuel' })
    ).json();
    expect(co.checkoutId).toBeTruthy();
    const rs = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        c.req('POST', `/api/v1/billing/simulate/${co.checkoutId}`, A, { resultat: 'succes' }),
      ),
      ...Array.from({ length: 4 }, () => webhook(co.checkoutId, 'paiement_reussi')),
    ]);
    for (const r of rs) expect(r.statusCode, r.body).toBe(200);
    expect(rs.filter((r) => r.json().resultat === 'traite')).toHaveLength(1);
    const me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    expect(me.abonnements).toHaveLength(1);
    // garde-fou déterministe : la base refuse un second abonnement pour la même référence du prestataire
    await expect(
      c.h.pool.query(
        `insert into subscription (account_id, plan_code, status, provider, provider_ref,
           current_period_start, current_period_end)
         select account_id, plan_code, 'active', provider, provider_ref, current_period_start,
           current_period_end from subscription where id = $1`,
        [me.abonnements[0].id],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('PAY-2 : annuler un abonnement impayé ou un essai terminé ne rend aucun droit (409)', async () => {
    const { A } = await adult(c, 'pay2@exemple.org');
    // essai : une annulation le termine ; une seconde est refusée et ne le ressuscite pas
    expect(
      (await c.req('POST', '/api/v1/billing/checkout', A, { plan: 'decouverte' })).statusCode,
    ).toBe(200);
    let me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    const essai = me.abonnements[0].id;
    expect(
      (await c.req('POST', `/api/v1/billing/subscriptions/${essai}/cancel`, A, {})).statusCode,
    ).toBe(200);
    const again = await c.req('POST', `/api/v1/billing/subscriptions/${essai}/cancel`, A, {});
    expect(again.statusCode).toBe(409);
    me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    expect(me.abonnements[0].status).toBe('expiree');
    expect(me.droits.plan).toBe('gratuit');
    // abonnement impayé : l'annulation est refusée, il reste impayé
    const co = (
      await c.req('POST', '/api/v1/billing/checkout', A, { plan: 'adulte_mensuel' })
    ).json();
    await c.req('POST', `/api/v1/billing/simulate/${co.checkoutId}`, A, { resultat: 'succes' });
    me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    const sub = me.abonnements.find((s: { plan: string }) => s.plan === 'adulte_mensuel');
    await c.h.pool.query("update subscription set status = 'impayee' where id = $1", [sub.id]);
    const r = await c.req('POST', `/api/v1/billing/subscriptions/${sub.id}/cancel`, A, {});
    expect(r.statusCode).toBe(409);
    me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    expect(me.abonnements.find((s: { id: string }) => s.id === sub.id).status).toBe('impayee');
    expect(me.droits.plan).toBe('gratuit');
  });

  it('PAY-5 : essai « découverte » — un seul, même avec 6 demandes simultanées', async () => {
    const { A } = await adult(c, 'pay5@exemple.org');
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.req('POST', '/api/v1/billing/checkout', A, { plan: 'decouverte' }),
      ),
    );
    expect(rs.filter((r) => r.statusCode === 200)).toHaveLength(1);
    for (const r of rs.filter((x) => x.statusCode !== 200))
      expect(r.json().error.code).toBe('essai_deja_utilise');
    const me = (await c.req('GET', '/api/v1/billing/me', A)).json();
    expect(me.abonnements.filter((s: { plan: string }) => s.plan === 'decouverte')).toHaveLength(1);
  });
});
