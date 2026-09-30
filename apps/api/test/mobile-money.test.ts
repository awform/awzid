/**
 * Complément E — mobile money SIMULÉ (Wave, Orange Money) : passes en francs CFA, notifications signées et
 * horodatées, montant contrôlé, idempotence et courses (comme PAY-1). Aucun compte réel, aucune clé.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling, type MobileOperator } from '@awform/billing';
import { PW, setupEdition, YEAR, cookieOf, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('mobile money simulé (awform_test)', () => {
  let c: Ctx;
  const billing = setupBilling({
    AWFORM_PAIEMENT: 'simule',
    AWFORM_PAIEMENT_SIM_SECRET: 'secret-mm',
  });
  beforeAll(async () => {
    c = await setupEdition(URL_!, { billing });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  /** adulte au Sénégal (zone Afrique de l'Ouest, francs CFA) */
  const senegal = async (email: string) => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email,
        password: PW,
        country: 'SN',
        birthYear: YEAR - 30,
        consents: ['cgu', 'transfert_hors_pays'],
      },
    );
    if (su.statusCode !== 201) throw new Error(su.body);
    return { cookie: cookieOf(su) };
  };
  const buy = async (A: Record<string, string>, plan = 'pass_3_mois') =>
    (
      await c.req('POST', '/api/v1/billing/checkout', A, {
        plan,
        prestataire: 'mobile_money',
        motDePasse: PW,
      })
    ).json() as { checkoutId: string; url: string };
  const notify = (
    checkoutId: string,
    o: {
      type?: 'paiement_reussi' | 'paiement_echoue';
      operateur?: MobileOperator;
      montant?: number;
      transactionId?: string;
      now?: number;
    } = {},
  ) => {
    const n = billing.simulatedMobile.notification(checkoutId, {
      type: o.type ?? 'paiement_reussi',
      operateur: o.operateur ?? 'wave',
      montant: o.montant ?? 3500,
      devise: 'XOF',
      ...(o.transactionId ? { transactionId: o.transactionId } : {}),
      ...(o.now ? { now: o.now } : {}),
    });
    return c.app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhook/mobile_money',
      headers: n.headers,
      payload: n.body,
    });
  };
  const subs = async (A: Record<string, string>) =>
    (await c.req('GET', '/api/v1/billing/me', A)).json().abonnements as Array<{
      plan: string;
      status: string;
    }>;

  it('offres au Sénégal : passes 1, 3 et 12 mois en francs CFA, par mobile money', async () => {
    const A = await senegal('mm-offres@exemple.sn');
    const p = (await c.req('GET', '/api/v1/billing/plans', A)).json();
    expect(p.zone).toBe('afrique_ouest');
    const passes = p.plans.filter((x: { kind: string }) => x.kind === 'pass');
    expect(passes.map((x: { code: string }) => x.code)).toEqual([
      'pass_1_mois',
      'pass_3_mois',
      'pass_12_mois',
    ]);
    for (const x of passes) {
      expect(x.prix.devise).toBe('XOF');
      expect(Number.isInteger(x.prix.montant)).toBe(true);
      expect(x.prestataires).toEqual(['mobile_money']);
    }
  });

  it('parcours : commande → notification signée de l’opérateur → pass actif', async () => {
    const A = await senegal('mm-ok@exemple.sn');
    const co = await buy(A);
    expect(co.url).toBe(`/abonnement/paiement-simule/${co.checkoutId}`);
    const d = (await c.req('GET', `/api/v1/billing/checkout/${co.checkoutId}`, A)).json();
    expect(d).toMatchObject({ montant: 3500, devise: 'XOF', prestataire: 'mobile_money' });
    const r = await notify(co.checkoutId, { operateur: 'orange_money' });
    expect(r.json().resultat).toBe('traite');
    expect(await subs(A)).toMatchObject([{ plan: 'pass_3_mois', status: 'active' }]);
    // par la page de paiement simulée (opérateur choisi) : même traitement
    const B = await senegal('mm-page@exemple.sn');
    const cb = await buy(B, 'pass_1_mois');
    const s = await c.req('POST', `/api/v1/billing/simulate/${cb.checkoutId}`, B, {
      resultat: 'succes',
      operateur: 'wave',
    });
    expect(s.json().resultat).toBe('traite');
    expect(await subs(B)).toMatchObject([{ plan: 'pass_1_mois', status: 'active' }]);
  });

  it('idempotence : la même notification renvoyée 6 fois en parallèle → un seul pass', async () => {
    const A = await senegal('mm-idem@exemple.sn');
    const co = await buy(A);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => notify(co.checkoutId, { transactionId: 'TX-IDEM' })),
    );
    const out = rs.map((r) => r.json().resultat).sort();
    expect(out).toEqual(['doublon', 'doublon', 'doublon', 'doublon', 'doublon', 'traite']);
    expect(await subs(A)).toHaveLength(1);
  });

  it('course : Wave et Orange Money notifient la même commande en même temps → un seul pass', async () => {
    const A = await senegal('mm-course@exemple.sn');
    const co = await buy(A);
    const rs = await Promise.all([
      ...Array.from({ length: 4 }, () => notify(co.checkoutId, { operateur: 'wave' })),
      ...Array.from({ length: 4 }, () => notify(co.checkoutId, { operateur: 'orange_money' })),
      c.req('POST', `/api/v1/billing/simulate/${co.checkoutId}`, A, { resultat: 'succes' }),
    ]);
    for (const r of rs) expect(r.statusCode, r.body).toBe(200);
    expect(rs.filter((r) => r.json().resultat === 'traite')).toHaveLength(1);
    expect(await subs(A)).toHaveLength(1);
  });

  it('montant falsifié, signature fausse, notification rejouée tard : rien n’est accordé', async () => {
    const A = await senegal('mm-fraude@exemple.sn');
    const co = await buy(A);
    expect((await notify(co.checkoutId, { montant: 100 })).json().resultat).toBe(
      'montant_incorrect',
    );
    const bad = await c.app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhook/mobile_money',
      headers: {
        'content-type': 'application/json',
        'x-mobile-signature': `t=1,v1=${'0'.repeat(64)}`,
      },
      payload: JSON.stringify({ transaction: 'x', statut: 'succes', commande: co.checkoutId }),
    });
    expect(bad.statusCode).toBe(400);
    const old = await notify(co.checkoutId, { now: Date.now() - 10 * 60_000 });
    expect(old.statusCode).toBe(400);
    expect(await subs(A)).toEqual([]);
    // la commande reste ouverte : un vrai paiement du bon montant l'honore ensuite
    expect((await notify(co.checkoutId)).json().resultat).toBe('traite');
    expect(await subs(A)).toHaveLength(1);
  });

  it('échec notifié : commande close, aucun pass ; succès tardif ignoré', async () => {
    const A = await senegal('mm-echec@exemple.sn');
    const co = await buy(A);
    expect((await notify(co.checkoutId, { type: 'paiement_echoue' })).json().resultat).toBe(
      'traite',
    );
    expect((await notify(co.checkoutId)).json().resultat).toBe('ignore');
    expect(await subs(A)).toEqual([]);
  });
});
