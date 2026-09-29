import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addPeriod,
  canOpenUnit,
  entitlementOf,
  formatPrice,
  NotConfiguredError,
  PLANS,
  planByCode,
  providersFor,
  setupBilling,
  SimulatedPaymentProvider,
  StripeProvider,
  trialAvailable,
  zoneOf,
} from '../src/index.js';

const DAY = 86_400_000;

describe('formules et prix', () => {
  it('zones de prix par pays', () => {
    expect(zoneOf('SN')).toBe('afrique_ouest');
    expect(zoneOf('fr')).toBe('europe');
    expect(zoneOf('US')).toBe('amerique_nord');
    expect(zoneOf('MA')).toBe('monde');
    expect(zoneOf(null)).toBe('monde');
  });
  it('chaque formule payante a un prix dans chaque zone où elle est vendue ; montants entiers', () => {
    for (const p of PLANS)
      for (const v of Object.values(p.prix)) {
        expect(Number.isInteger(v!.montant)).toBe(true);
        expect(v!.montant).toBeGreaterThan(0);
      }
    expect(planByCode('pass_3_mois')!.prix.europe).toBeUndefined();
  });
  it('affichage des prix (franc CFA sans décimales)', () => {
    expect(formatPrice(599, 'EUR').replace(/\s/g, ' ')).toBe('5,99 €');
    expect(formatPrice(1500, 'XOF').replace(/\s/g, ' ')).toMatch(/^1 500 F\s?CFA$/);
  });
  it('moyens : mobile money d’abord en Afrique de l’Ouest, pass = mobile money seulement', () => {
    expect(providersFor('afrique_ouest', planByCode('famille_mensuel')!)).toEqual([
      'mobile_money',
      'stripe',
    ]);
    expect(providersFor('europe', planByCode('famille_mensuel')!)).toEqual(['stripe', 'paypal']);
    expect(providersFor('afrique_ouest', planByCode('pass_3_mois')!)).toEqual(['mobile_money']);
    expect(providersFor('europe', planByCode('decouverte')!)).toEqual([]);
  });
  it('périodes', () => {
    const s = new Date('2026-01-31T00:00:00Z');
    expect(addPeriod(s, { jours: 14 })!.toISOString().slice(0, 10)).toBe('2026-02-14');
    expect(addPeriod(s, { mois: 12 })!.toISOString().slice(0, 10)).toBe('2027-01-31');
    expect(addPeriod(s, null)).toBeNull();
  });
});

describe('droits d’accès', () => {
  const now = new Date('2026-09-29T10:00:00Z');
  it('gratuit par défaut : cinq premières leçons de chaque livre', () => {
    const e = entitlementOf([], { now });
    expect(e.plan).toBe('gratuit');
    expect(canOpenUnit(e.droits, { n: 5 })).toBe(true);
    expect(canOpenUnit(e.droits, { n: 6 })).toBe(false);
  });
  it('la meilleure formule ACTIVE l’emporte ; annulée : jusqu’à la fin payée ; expirée : plus rien', () => {
    const e = entitlementOf(
      [
        {
          planCode: 'decouverte',
          status: 'essai',
          currentPeriodEnd: new Date(now.getTime() - DAY),
        },
        {
          planCode: 'famille_mensuel',
          status: 'annulee',
          currentPeriodEnd: new Date(now.getTime() + DAY),
        },
      ],
      { now },
    );
    expect(e.plan).toBe('famille_mensuel');
    expect(canOpenUnit(e.droits, { n: 25 })).toBe(true);
    expect(e.droits.profilsMax).toBe(6);
    expect(
      entitlementOf([{ planCode: 'famille_mensuel', status: 'expiree', currentPeriodEnd: null }], {
        now,
      }).plan,
    ).toBe('gratuit');
    expect(
      entitlementOf(
        [
          {
            planCode: 'adulte_mensuel',
            status: 'impayee',
            currentPeriodEnd: new Date(now.getTime() + DAY),
          },
        ],
        { now },
      ).plan,
    ).toBe('gratuit');
  });
  it('licence d’école : l’élève d’une classe couverte a tous les droits', () => {
    const e = entitlementOf([], {
      now,
      schoolLicence: { until: new Date(now.getTime() + 30 * DAY) },
    });
    expect(e).toMatchObject({ plan: 'licence_ecole', source: 'ecole' });
  });
  it('essai offert une seule fois', () => {
    expect(trialAvailable([])).toBe(true);
    expect(
      trialAvailable([{ planCode: 'decouverte', status: 'expiree', currentPeriodEnd: now }]),
    ).toBe(false);
  });
});

describe('prestataires', () => {
  it('désactivé par défaut ; simulé pour tous les moyens ; réels seulement avec leurs clés', () => {
    expect(setupBilling({}).mode).toBe('off');
    expect(setupBilling({}).provider('stripe')).toBeNull();
    const sim = setupBilling({ AWFORM_PAIEMENT: 'simule' });
    expect(sim.provider('mobile_money')?.id).toBe('simule');
    const reel = setupBilling({ AWFORM_PAIEMENT: 'reel' });
    expect(reel.available(['stripe', 'paypal', 'mobile_money'])).toEqual([]);
    const withStripe = setupBilling({
      AWFORM_PAIEMENT: 'reel',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
    });
    expect(withStripe.available(['stripe', 'paypal'])).toEqual(['stripe']);
  });
  it('un prestataire sans clé refuse de créer un paiement', async () => {
    const p = new StripeProvider({});
    await expect(
      p.createCheckout({
        checkoutId: 'c1',
        plan: 'famille_mensuel',
        montant: 599,
        devise: 'EUR',
        renouvelable: true,
        periodeMois: 1,
        retour: { succes: '/', abandon: '/' },
      }),
    ).rejects.toBeInstanceOf(NotConfiguredError);
  });
  it('simulé : événement signé, signature falsifiée refusée', async () => {
    const p = new SimulatedPaymentProvider('secret-de-test');
    const e = p.event('chk1', 'paiement_reussi');
    expect(await p.parseWebhook(e.headers, e.body)).toMatchObject({
      type: 'paiement_reussi',
      checkoutId: 'chk1',
    });
    await expect(p.parseWebhook({ 'x-simule-signature': 'faux' }, e.body)).rejects.toThrow(
      'signature_invalide',
    );
    const other = new SimulatedPaymentProvider('autre-secret');
    await expect(other.parseWebhook(e.headers, e.body)).rejects.toThrow('signature_invalide');
  });
  it('Stripe : vérification de signature (t=…,v1=…), rejeu refusé', async () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'chk9',
          subscription: 'sub_1',
          payment_status: 'paid',
        },
      },
    });
    const t = 1_790_000_000;
    const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    expect(StripeProvider.verify(`t=${t},v1=${v1}`, body, secret, t + 10)).toBe(true);
    expect(StripeProvider.verify(`t=${t},v1=${v1}`, body, secret, t + 1000)).toBe(false);
    expect(StripeProvider.verify(`t=${t},v1=${v1}`, `${body} `, secret, t + 10)).toBe(false);
    const p = new StripeProvider({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: secret });
    const now = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex');
    expect(await p.parseWebhook({ 'stripe-signature': `t=${now},v1=${sig}` }, body)).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      type: 'paiement_reussi',
      checkoutId: 'chk9',
      reference: 'sub_1',
    });
  });

  it('audit PAY-3 : Stripe — droits seulement pour un paiement ENCAISSÉ ; la 1re facture n’ajoute pas de mois', async () => {
    const secret = 'whsec_pay3';
    const p = new StripeProvider({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: secret });
    const send = (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({ id: `evt_${type}`, type, data: { object } });
      const now = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex');
      return p.parseWebhook({ 'stripe-signature': `t=${now},v1=${sig}` }, body);
    };
    const session = { id: 'cs_2', client_reference_id: 'chk2', subscription: 'sub_2' };
    // SEPA (asynchrone) : session terminée mais pas encore payée → rien
    expect(
      await send('checkout.session.completed', { ...session, payment_status: 'unpaid' }),
    ).toBeNull();
    // l'encaissement arrive plus tard
    expect(
      await send('checkout.session.async_payment_succeeded', {
        ...session,
        payment_status: 'paid',
      }),
    ).toMatchObject({ type: 'paiement_reussi', checkoutId: 'chk2', reference: 'sub_2' });
    // première facture de l'abonnement : déjà couverte par le paiement initial
    expect(
      await send('invoice.paid', {
        id: 'in_1',
        subscription: 'sub_2',
        billing_reason: 'subscription_create',
      }),
    ).toBeNull();
    // les suivantes renouvellent
    expect(
      await send('invoice.paid', {
        id: 'in_2',
        subscription: 'sub_2',
        billing_reason: 'subscription_cycle',
      }),
    ).toMatchObject({ type: 'renouvellement', reference: 'sub_2' });
  });
});
