/**
 * Lot 10 — paiements (prestataire SIMULÉ) : offres par zone, désactivé par défaut, essai unique, barrière
 * parentale, paiement simulé → événement signé → droits ; idempotence des webhooks ; signature falsifiée
 * refusée ; annulation (droits jusqu'à la fin de période) ; licence d'école pour les élèves d'une classe.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { connect, resetTestDatabase, runMigrations, schema as t, type DbHandle } from '@awform/db';
import { setupBilling } from '@awform/billing';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

describe.skipIf(!URL)('lot 10 — paiements (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let off: FastifyInstance;
  const billing = setupBilling({
    AWFORM_PAIEMENT: 'simule',
    AWFORM_PAIEMENT_SIM_SECRET: 'secret-de-test',
  });
  let parent = '';
  let adult = '';
  let teacher = '';
  let child = '';

  const req = (
    a: FastifyInstance,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    cookie = '',
    payload?: object,
  ) =>
    a.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  const signup = async (email: string, kind: 'parent' | 'adulte', country: string) =>
    cookieOf(
      await req(app, 'POST', '/api/v1/auth/signup', '', {
        kind,
        email,
        password: PW,
        country,
        consents: country === 'SN' ? ['cgu', 'transfert_hors_pays'] : ['cgu'],
        birthYear: 1985,
        ...(kind === 'adulte' ? { pseudonym: 'Moi' } : {}),
      }),
    );

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    const key = randomBytes(32);
    app = buildApp({ db: h.db, secretKey: key, billing });
    off = buildApp({ db: h.db, secretKey: key, billing: setupBilling({}) });
    await app.ready();
    await off.ready();
    parent = await signup('parent.paie@exemple.org', 'parent', 'SN');
    adult = await signup('adulte.paie@exemple.org', 'adulte', 'FR');
    await req(app, 'POST', '/api/v1/account/pin', parent, { pin: '2468', password: PW });
    child = (
      await req(app, 'POST', '/api/v1/profiles', parent, {
        pseudonym: 'Awa',
        birthYear: YEAR - 9,
        password: PW,
        consents: ['compte_suivi'],
      })
    ).json().id;
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'maitre.paie@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    teacher = cookieOf(
      await req(app, 'POST', '/api/v1/auth/login', '', {
        email: 'maitre.paie@ecole.example',
        password: PW,
      }),
    );
    const s = (await req(app, 'POST', '/api/v1/auth/totp/setup', teacher, {})).json();
    await req(app, 'POST', '/api/v1/auth/totp/confirm', teacher, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await app?.close();
    await off?.close();
    await h?.close();
  });

  it('offres par zone : franc CFA et mobile money au Sénégal, euros en France ; vente désactivée par défaut', async () => {
    const sn = (await req(app, 'GET', '/api/v1/billing/plans', parent)).json();
    expect(sn.zone).toBe('afrique_ouest');
    const fam = sn.plans.find((p: { code: string }) => p.code === 'famille_mensuel');
    expect(fam.prix).toEqual({ devise: 'XOF', montant: 1500 });
    expect(fam.prestataires[0]).toBe('mobile_money');
    expect(sn.plans.some((p: { code: string }) => p.code === 'pass_3_mois')).toBe(true);
    const fr = (await req(app, 'GET', '/api/v1/billing/plans', adult)).json();
    expect(fr.zone).toBe('europe');
    expect(fr.plans.some((p: { code: string }) => p.code === 'pass_3_mois')).toBe(false);
    expect((await req(off, 'GET', '/api/v1/billing/plans')).json().mode).toBe('off');
    expect(
      (await req(off, 'POST', '/api/v1/billing/checkout', adult, { plan: 'adulte_mensuel' })).json()
        .error.code,
    ).toBe('paiement_desactive');
  });

  it('essai « découverte » : une seule fois ; droits complets pendant l’essai', async () => {
    expect(
      (await req(app, 'POST', '/api/v1/billing/checkout', adult, { plan: 'decouverte' })).json()
        .essai,
    ).toBe(true);
    const me = (await req(app, 'GET', '/api/v1/billing/me', adult)).json();
    expect(me.droits.plan).toBe('decouverte');
    expect(me.droits.droits.niveaux).toBe('tous');
    expect(
      (await req(app, 'POST', '/api/v1/billing/checkout', adult, { plan: 'decouverte' })).json()
        .error.code,
    ).toBe('essai_deja_utilise');
  });

  it('barrière parentale : code parent exigé pour acheter', async () => {
    expect(
      (
        await req(app, 'POST', '/api/v1/billing/checkout', parent, { plan: 'famille_mensuel' })
      ).json().error.code,
    ).toBe('code_parent_requis');
    expect(
      (
        await req(app, 'POST', '/api/v1/billing/checkout', parent, {
          plan: 'famille_mensuel',
          pin: '0000',
        })
      ).json().error.code,
    ).toBe('code_parent_requis');
    expect(
      (
        await req(app, 'POST', '/api/v1/billing/checkout', parent, {
          plan: 'adulte_mensuel',
          pin: '2468',
        })
      ).json().error.code,
    ).toBe('formule_non_disponible');
  });

  it('paiement simulé réussi → abonnement actif ; échec → aucun droit', async () => {
    const c = (
      await req(app, 'POST', '/api/v1/billing/checkout', parent, {
        plan: 'famille_mensuel',
        pin: '2468',
      })
    ).json();
    expect(c.url).toBe(`/abonnement/paiement-simule/${c.checkoutId}`);
    expect(
      (await req(app, 'GET', `/api/v1/billing/checkout/${c.checkoutId}`, adult)).statusCode,
    ).toBe(404);
    const d = (await req(app, 'GET', `/api/v1/billing/checkout/${c.checkoutId}`, parent)).json();
    expect(d).toMatchObject({
      montant: 1500,
      devise: 'XOF',
      prestataire: 'mobile_money',
      status: 'ouverte',
    });
    expect(
      (
        await req(app, 'POST', `/api/v1/billing/simulate/${c.checkoutId}`, parent, {
          resultat: 'succes',
        })
      ).json().resultat,
    ).toBe('traite');
    const me = (await req(app, 'GET', '/api/v1/billing/me', parent)).json();
    expect(me.droits.plan).toBe('famille_mensuel');
    expect(me.abonnements[0]).toMatchObject({ plan: 'famille_mensuel', status: 'active' });
    // deuxième résultat pour la même session : ignoré (session déjà payée)
    expect(
      (
        await req(app, 'POST', `/api/v1/billing/simulate/${c.checkoutId}`, parent, {
          resultat: 'echec',
        })
      ).json().resultat,
    ).toBe('ignore');

    const f = (
      await req(app, 'POST', '/api/v1/billing/checkout', adult, {
        plan: 'adulte_annuel',
        prestataire: 'paypal',
        motDePasse: PW, // audit PAY-6 : sans code parent, le mot de passe du compte
      })
    ).json();
    await req(app, 'POST', `/api/v1/billing/simulate/${f.checkoutId}`, adult, {
      resultat: 'echec',
    });
    const [row] = await h.db
      .select()
      .from(t.billingCheckout)
      .where(eq(t.billingCheckout.id, f.checkoutId));
    expect(row!.status).toBe('echouee');
  });

  it('webhook : signature vérifiée, idempotent, sans en-tête CSRF', async () => {
    const c = (
      await req(app, 'POST', '/api/v1/billing/checkout', adult, {
        plan: 'adulte_mensuel',
        motDePasse: PW,
      })
    ).json();
    const e = billing.simulated.event(c.checkoutId, 'paiement_reussi');
    const send = (headers: Record<string, string>, body: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhook/simule',
        headers: { 'content-type': 'application/json', ...headers },
        payload: body,
      });
    expect((await send({ 'x-simule-signature': 'falsifiee' }, e.body)).statusCode).toBe(400);
    expect((await send(e.headers, e.body)).json().resultat).toBe('traite');
    expect((await send(e.headers, e.body)).json().resultat).toBe('doublon');
    const subs = await h.db
      .select()
      .from(t.subscription)
      .where(eq(t.subscription.planCode, 'adulte_mensuel'));
    expect(subs).toHaveLength(1);
    expect(
      (await send(e.headers, e.body.replace('paiement_reussi', 'annulation'))).statusCode,
    ).toBe(400);
  });

  it('annulation : les droits restent jusqu’à la fin de la période payée', async () => {
    const me = (await req(app, 'GET', '/api/v1/billing/me', parent)).json();
    const id = me.abonnements[0].id;
    expect(
      (await req(app, 'POST', `/api/v1/billing/subscriptions/${id}/cancel`, adult, {})).statusCode,
    ).toBe(404);
    expect(
      (await req(app, 'POST', `/api/v1/billing/subscriptions/${id}/cancel`, parent, {})).json().ok,
    ).toBe(true);
    const after = (await req(app, 'GET', '/api/v1/billing/me', parent)).json();
    expect(after.abonnements[0]).toMatchObject({ status: 'annulee', annulationFinPeriode: true });
    expect(after.droits.plan).toBe('famille_mensuel');
  });

  it('licence d’école : les élèves des classes de l’enseignant sont couverts (places suffisantes)', async () => {
    const cls = (await req(app, 'POST', '/api/v1/teacher/classes', teacher, { name: 'CE1' })).json()
      .class;
    // audit SEC-3 : l'inscription d'un enfant dans une classe exige le code parent
    await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${child}/classes`,
      payload: { code: cls.joinCode, consent: true },
      headers: { 'x-awform': '1', cookie: parent, 'x-parent-pin': '2468' },
    });
    const c = (
      await req(app, 'POST', '/api/v1/billing/checkout', teacher, {
        plan: 'licence_ecole',
        places: 25,
        motDePasse: PW,
      })
    ).json();
    const d = (await req(app, 'GET', `/api/v1/billing/checkout/${c.checkoutId}`, teacher)).json();
    expect(d).toMatchObject({ montant: 6000 * 25, places: 25 });
    await req(app, 'POST', `/api/v1/billing/simulate/${c.checkoutId}`, teacher, {
      resultat: 'succes',
    });
    const me = (await req(app, 'GET', '/api/v1/billing/me', parent)).json();
    expect(me.profils.find((p: { id: string }) => p.id === child).plan).toBe('famille_mensuel');
    // un parent sans abonnement : l'enfant couvert par la licence
    await h.db
      .update(t.subscription)
      .set({ status: 'expiree' })
      .where(eq(t.subscription.planCode, 'famille_mensuel'));
    const me2 = (await req(app, 'GET', '/api/v1/billing/me', parent)).json();
    expect(me2.droits.plan).toBe('gratuit');
    expect(me2.profils.find((p: { id: string }) => p.id === child).plan).toBe('licence_ecole');
  });
});
