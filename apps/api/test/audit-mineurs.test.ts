/**
 * Audit — âge et consentements des mineurs : MIN-1, MIN-2, MIN-3, MIN-4, SEC-3 (un bloc par constat).
 * Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling } from '@awform/billing';
import { setupTutor } from '@awform/tutor';
import {
  child,
  cookieOf,
  newClass,
  parent,
  PW,
  setupEdition,
  teacher,
  YEAR,
  type Ctx,
} from './helpers.js';

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

  it('MIN-3 : compte parent — année de naissance obligatoire et majorité exigée (Sénégal compris)', async () => {
    const base = {
      kind: 'parent',
      email: 'min3@exemple.org',
      password: PW,
      country: 'SN',
      consents: ['cgu', 'transfert_hors_pays'],
    };
    const sans = await c.req('POST', '/api/v1/auth/signup', {}, base);
    expect(sans.json().error?.code).toBe('annee_naissance_requise');
    const jeune = await c.req('POST', '/api/v1/auth/signup', {}, { ...base, birthYear: YEAR - 15 });
    expect(jeune.statusCode).toBe(403);
    expect(jeune.json().error.code).toBe('majorite_requise');
    const ok = await c.req('POST', '/api/v1/auth/signup', {}, { ...base, birthYear: YEAR - 35 });
    expect(ok.statusCode, ok.body).toBe(201);
    // la preuve des accords garde la déclaration de majorité
    const cs = (await c.req('GET', '/api/v1/account/consents', { cookie: cookieOf(ok) })).json();
    expect(cs.consents.length).toBeGreaterThan(0);
    const [row] = await c.h.pool
      .query(
        "select evidence from consent where type = 'cgu' and country = 'SN' order by given_at desc limit 1",
      )
      .then((r) => r.rows);
    expect(row.evidence).toMatchObject({ majoriteDeclaree: true });
  });

  it('MIN-4 : accord « tuteur IA » — code parent exigé, preuve et pays gardés, retirable depuis « mes accords »', async () => {
    const fam = await parent(c, 'min4@exemple.org');
    const kid = await child(c, fam.P, 'Moussa', 11);
    const url = `/api/v1/profiles/${kid}/tuteur`;
    expect((await c.req('PUT', url, fam.P, { actif: true })).statusCode).toBe(401);
    expect((await c.req('PUT', url, fam.pin, { actif: true })).statusCode).toBe(200);
    const cs = (await c.req('GET', '/api/v1/account/consents', fam.P)).json().consents as Array<{
      id: string;
      type: string;
      optional: boolean;
    }>;
    const tu = cs.find((x) => x.type === 'tuteur_ia')!;
    expect(tu.optional).toBe(true);
    const [row] = await c.h.pool
      .query('select country, evidence from consent where id = $1', [tu.id])
      .then((r) => r.rows);
    expect(row.country).toBe('FR');
    expect(row.evidence).toMatchObject({ methode: 'code_parent' });
    const w = await c.req('POST', `/api/v1/account/consents/${tu.id}/withdraw`, fam.P, {});
    expect(w.statusCode, w.body).toBe(200);
  });

  it('SEC-3 : partage avec l’enseignant (inscription dans une classe) — code parent exigé, preuve gardée', async () => {
    const fam = await parent(c, 'sec3@exemple.org');
    const kid = await child(c, fam.P, 'Fatou', 9);
    const T = await teacher(c, 'sec3@ecole.example');
    const cls = await newClass(c, T, 'Classe SEC-3');
    const url = `/api/v1/profiles/${kid}/classes`;
    const body = { code: cls.joinCode, consent: true };
    expect((await c.req('POST', url, fam.P, body)).statusCode).toBe(401);
    const ok = await c.req('POST', url, fam.pin, body);
    expect(ok.statusCode, ok.body).toBe(201);
    const [row] = await c.h.pool
      .query("select evidence from consent where type = 'partage_enseignant' and profile_id = $1", [
        kid,
      ])
      .then((r) => r.rows);
    expect(row.evidence).toMatchObject({ methode: 'code_parent' });
  });

  it('MIN-17 : règles du pays appliquées aux profils — la preuve des accords d’un enfant garde loi et autorité', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1980,
        email: 'min17@exemple.org',
        password: PW,
        country: 'SN',
        consents: ['cgu', 'transfert_hors_pays'],
      },
    );
    const P = { cookie: cookieOf(su) };
    const kid = await child(c, P, 'Aminata', 8);
    const tuteurPin = { ...P }; // pas de code parent défini : accord direct
    await c.req('PUT', `/api/v1/profiles/${kid}/tuteur`, tuteurPin, { actif: true });
    const rows = await c.h.pool
      .query('select type, evidence from consent where profile_id = $1', [kid])
      .then((r) => r.rows as Array<{ type: string; evidence: Record<string, unknown> }>);
    expect(rows.map((r) => r.type).sort()).toEqual(['compte_suivi', 'tuteur_ia']);
    for (const r of rows)
      expect(r.evidence, r.type).toMatchObject({ loi: 'sn_2008_12', autorite: 'cdp_sn' });
  });
});
