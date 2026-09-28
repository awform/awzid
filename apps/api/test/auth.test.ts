/**
 * Lot 4 — comptes, profils, consentements, RGPD, second facteur, politique d'accès (OWASP ASVS 5.0 N2).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
  contentDir,
  importEdition,
  purgeDeletedAccounts,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { checkPassword } from '../src/auth/passwords.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(contentDir(), 'data', 'index-lecons.js'));
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

describe('politique des mots de passe (sans base)', () => {
  it('longueur, mots de passe courants, adresse dans le mot de passe', () => {
    expect(checkPassword('court')).toBe('trop_court');
    expect(checkPassword('motdepasse123')).toBe('trop_courant');
    expect(checkPassword('aaaaaaaaaaaaaaa')).toBe('trop_courant');
    expect(checkPassword('fatima.diallo-2026!', 'fatima.diallo@exemple.org')).toBe(
      'contient_email',
    );
    expect(checkPassword('une phrase de passe كَلِمَة')).toBeNull();
  });
});

describe.skipIf(!READY)('comptes, profils et droits (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let noKey: FastifyInstance;
  const key = randomBytes(32);

  const post = (url: string, payload: object, cookie = '', csrf = true) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      headers: { ...(csrf ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  const get = (url: string, cookie = '') =>
    app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const signup = (email: string, over: object = {}) =>
    post('/api/v1/auth/signup', {
      kind: 'parent',
      email,
      password: PW,
      country: 'FR',
      consents: ['cgu'],
      ...over,
    });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: contentDir(), levels: ['en1', 'ad1'], withRegistry: false }),
      {
        code: 'auth',
        publish: true,
      },
    );
    app = buildApp({ db: h.db, secretKey: key });
    noKey = buildApp({ db: h.db, secretKey: null });
    await app.ready();
    await noKey.ready();
  });
  afterAll(async () => {
    await app?.close();
    await noKey?.close();
    await h?.close();
  });

  it('CSRF : une requête qui modifie sans en-tête x-awform est refusée', async () => {
    const r = await post('/api/v1/auth/signup', {}, '', false);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ error: { code: 'csrf' } });
  });

  it('inscription parent : consentement requis, mot de passe fort, cookie de session sûr', async () => {
    expect((await signup('p1@exemple.org', { consents: [] })).json().error.code).toBe(
      'consentement_requis',
    );
    expect((await signup('p1@exemple.org', { password: 'motdepasse123' })).json().error.code).toBe(
      'mot_de_passe_trop_courant',
    );
    const r = await signup('P1@Exemple.org');
    expect(r.statusCode).toBe(201);
    const sc = String(r.headers['set-cookie']);
    expect(sc).toMatch(/awform_session=[A-Za-z0-9_-]{40,}/);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    expect(sc).toMatch(/Secure/);
    expect(r.json().account).toMatchObject({
      kind: 'parent',
      email: 'p1…@exemple.org',
      country: 'FR',
    });
    expect((await signup('p1@exemple.org')).statusCode).toBe(409);
    // le jeton n'est jamais stocké en clair
    const sessions = await h.db.select().from(t.session);
    expect(sessions.every((s) => !sc.includes(s.tokenHash))).toBe(true);
  });

  it('pays hors UE (Sénégal) : consentement exprès au transfert des données ; adulte trop jeune → parent', async () => {
    const sn = await signup('sn@exemple.org', { country: 'SN' });
    expect(sn.json().error).toMatchObject({
      code: 'consentement_requis',
      missing: ['transfert_hors_pays'],
    });
    expect(
      (await signup('sn@exemple.org', { country: 'SN', consents: ['cgu', 'transfert_hors_pays'] }))
        .statusCode,
    ).toBe(201);
    const young = await signup('jeune@exemple.org', { kind: 'adulte', birthYear: YEAR - 14 });
    expect(young.json().error).toMatchObject({ code: 'age_parent_requis', age: 15 });
    const adult = await signup('adulte@exemple.org', {
      kind: 'adulte',
      birthYear: 1990,
      pseudonym: 'Awa',
    });
    expect(adult.statusCode).toBe(201);
    expect(adult.json().profiles).toEqual([
      expect.objectContaining({ kind: 'adulte', pseudonym: 'Awa' }),
    ]);
  });

  it('profil d’enfant : ré-authentification du parent, consentement daté avec preuve, COPPA aux États-Unis', async () => {
    const c = cookieOf(await post('/api/v1/auth/login', { email: 'p1@exemple.org', password: PW }));
    const base = {
      pseudonym: 'Petite étoile',
      birthYear: YEAR - 7,
      avatar: 'etoile',
      levelCode: 'en1',
      consents: ['compte_suivi'],
    };
    expect(
      (await post('/api/v1/profiles', { ...base, password: 'mauvais mot de passe' }, c)).statusCode,
    ).toBe(401);
    expect(
      (await post('/api/v1/profiles', { ...base, password: PW, consents: [] }, c)).json().error
        .code,
    ).toBe('consentement_requis');
    const r = await post('/api/v1/profiles', { ...base, password: PW }, c);
    expect(r.statusCode).toBe(201);
    const [consent] = await h.db
      .select()
      .from(t.consent)
      .where(eq(t.consent.profileId, r.json().id));
    expect(consent).toMatchObject({
      type: 'compte_suivi',
      country: 'FR',
      evidence: expect.objectContaining({ methode: 'reauthentification_mot_de_passe+declaration' }),
    });
    // États-Unis, moins de 13 ans : consentement parental vérifiable exigé
    const us = cookieOf(
      await signup('us@exemple.org', { country: 'US', consents: ['cgu', 'transfert_hors_pays'] }),
    );
    const k = await post('/api/v1/profiles', { ...base, password: PW }, us);
    expect(k.json().error).toMatchObject({
      code: 'consentement_requis',
      missing: ['coppa_parent'],
    });
    expect(
      (
        await post(
          '/api/v1/profiles',
          { ...base, password: PW, consents: ['compte_suivi', 'coppa_parent'] },
          us,
        )
      ).statusCode,
    ).toBe(201);
    // un adulte n'a pas de profil d'enfant
    expect(
      (await post('/api/v1/profiles', { ...base, password: PW, birthYear: 1990 }, c)).json().error
        .code,
    ).toBe('adulte_compte_personnel');
  });

  it('connexion : message identique si le compte n’existe pas, verrouillage après 5 échecs', async () => {
    const a = await post('/api/v1/auth/login', {
      email: 'p1@exemple.org',
      password: 'faux faux faux',
    });
    const b = await post('/api/v1/auth/login', {
      email: 'personne@exemple.org',
      password: 'faux faux faux',
    });
    expect(a.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    await signup('cible@exemple.org');
    for (let i = 0; i < 5; i++)
      await post('/api/v1/auth/login', { email: 'cible@exemple.org', password: 'faux faux faux' });
    const locked = await post('/api/v1/auth/login', { email: 'cible@exemple.org', password: PW });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('verrouille');
  });

  it('sessions : déconnexion effective, changement de mot de passe = autres appareils déconnectés', async () => {
    await signup('s@exemple.org');
    const c1 = cookieOf(await post('/api/v1/auth/login', { email: 's@exemple.org', password: PW }));
    const c2 = cookieOf(await post('/api/v1/auth/login', { email: 's@exemple.org', password: PW }));
    expect(c1).not.toBe(c2); // nouveau jeton à chaque connexion
    expect((await get('/api/v1/auth/me', c1)).statusCode).toBe(200);
    const NEW = 'une autre phrase de passe 2027';
    expect((await post('/api/v1/auth/password', { current: PW, next: NEW }, c1)).statusCode).toBe(
      200,
    );
    expect((await get('/api/v1/auth/me', c2)).statusCode).toBe(401);
    expect((await get('/api/v1/auth/me', c1)).statusCode).toBe(200);
    await post('/api/v1/auth/logout', {}, c1);
    expect((await get('/api/v1/auth/me', c1)).statusCode).toBe(401);
  });

  it('tentatives et progression : uniquement pour les profils du compte connecté', async () => {
    const c = cookieOf(await post('/api/v1/auth/login', { email: 'p1@exemple.org', password: PW }));
    const me = (await get('/api/v1/auth/me', c)).json();
    const child = me.profiles[0].id as string;
    const other = cookieOf(
      await post('/api/v1/auth/login', { email: 'adulte@exemple.org', password: PW }),
    );
    const unit = (await get('/api/v1/units/en1.l02')).json().unit;
    const k = unit.exercises.findIndex((e: { type: string }) => e.type === 'premiere_lettre');
    const ev = {
      id: randomUUID(),
      profileId: child,
      unitId: 'en1.l02',
      eventType: 'reponse',
      exerciseId: unit.exercises[k].id,
      exerciseHash: unit.exercises[k].hash,
      itemIndex: 0,
      response: { choice: unit.lesson.exercices[k].items[0].reponse },
      deviceAt: new Date().toISOString(),
    };
    expect((await post('/api/v1/attempts', { events: [ev] })).statusCode).toBe(401);
    const stolen = await post('/api/v1/attempts', { events: [{ ...ev, id: randomUUID() }] }, other);
    expect(stolen.json().rejected).toEqual([
      { id: expect.any(String), reason: 'profil non autorisé' },
    ]);
    const ok = await post('/api/v1/attempts', { events: [ev] }, c);
    expect(ok.json().accepted).toEqual([{ id: ev.id, correct: true }]);
    expect((await get(`/api/v1/progress?profile=${child}&level=en1`, other)).statusCode).toBe(404);
    expect(
      (await get(`/api/v1/progress?profile=${child}&level=en1`, c)).json().progress,
    ).toHaveLength(1);
  });

  it('code parent : défini avec le mot de passe, vérifié, verrouillé après 5 erreurs', async () => {
    const c = cookieOf(await post('/api/v1/auth/login', { email: 'p1@exemple.org', password: PW }));
    expect(
      (await post('/api/v1/account/pin', { pin: '2468', password: 'faux faux faux' }, c))
        .statusCode,
    ).toBe(401);
    expect((await post('/api/v1/account/pin', { pin: '2468', password: PW }, c)).statusCode).toBe(
      200,
    );
    expect((await post('/api/v1/account/pin/verify', { pin: '2468' }, c)).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) await post('/api/v1/account/pin/verify', { pin: '0000' }, c);
    expect((await post('/api/v1/account/pin/verify', { pin: '2468' }, c)).statusCode).toBe(429);
  });

  it('RGPD : consentements, export complet, suppression puis effacement définitif à 30 jours', async () => {
    const c = cookieOf(
      await post('/api/v1/auth/login', { email: 'adulte@exemple.org', password: PW }),
    );
    const consents = (await get('/api/v1/account/consents', c)).json().consents;
    expect(consents.map((x: { type: string }) => x.type)).toEqual(['cgu']);
    expect(
      (await post(`/api/v1/account/consents/${consents[0].id}/withdraw`, {}, c)).statusCode,
    ).toBe(409);
    const exp = await get('/api/v1/account/export', c);
    expect(exp.headers['content-disposition']).toMatch(/attachment/);
    expect(exp.json()).toMatchObject({
      compte: { email: 'adulte@exemple.org' },
      profils: [expect.objectContaining({ pseudonym: 'Awa' })],
    });
    expect(JSON.stringify(exp.json())).not.toMatch(/password|token/i);
    expect((await post('/api/v1/account/delete', { password: PW }, c)).statusCode).toBe(200);
    expect(
      (await post('/api/v1/auth/login', { email: 'adulte@exemple.org', password: PW })).statusCode,
    ).toBe(401);
    expect(await purgeDeletedAccounts(h.db, 30)).toBe(0);
    expect(await purgeDeletedAccounts(h.db, 30, new Date(Date.now() + 31 * 86400_000))).toBe(1);
    const left = await h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'adulte@exemple.org'));
    expect(left).toEqual([]);
  });

  it('enseignant : second facteur obligatoire (TOTP), code à usage unique', async () => {
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'prof@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const c = cookieOf(
      await post('/api/v1/auth/login', { email: 'prof@ecole.example', password: PW }),
    );
    expect((await get('/api/v1/teacher/overview', c)).json().error.code).toBe('mfa_a_configurer');
    expect(
      (
        await noKey.inject({
          method: 'POST',
          url: '/api/v1/auth/totp/setup',
          headers: { cookie: c, 'x-awform': '1' },
        })
      ).statusCode,
    ).toBe(503);
    const setup = (await post('/api/v1/auth/totp/setup', {}, c)).json();
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/AWFORM/);
    expect((await post('/api/v1/auth/totp/confirm', { code: '000000' }, c)).statusCode).toBe(400);
    const code = totpAt(setup.secret, Math.floor(Date.now() / 30_000));
    expect((await post('/api/v1/auth/totp/confirm', { code }, c)).statusCode).toBe(200);
    expect((await get('/api/v1/teacher/overview', c)).statusCode).toBe(200);
    const [stored] = await h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'prof@ecole.example'));
    expect(stored?.totpSecretEnc).not.toContain(setup.secret); // chiffré au repos
    expect(
      (await post('/api/v1/auth/login', { email: 'prof@ecole.example', password: PW })).json().error
        .code,
    ).toBe('totp_requis');
    // le même code ne sert pas deux fois (anti-rejeu)
    expect(
      (
        await post('/api/v1/auth/login', { email: 'prof@ecole.example', password: PW, totp: code })
      ).json().error.code,
    ).toBe('totp_incorrect');
    const next = totpAt(setup.secret, Math.floor(Date.now() / 30_000) + 1);
    const ok = await post('/api/v1/auth/login', {
      email: 'prof@ecole.example',
      password: PW,
      totp: next,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().mfaVerified).toBe(true);
    // un enseignant ne crée pas de profil d'enfant
    expect(
      (
        await post(
          '/api/v1/profiles',
          { pseudonym: 'x', birthYear: YEAR - 8, password: PW, consents: ['compte_suivi'] },
          cookieOf(ok),
        )
      ).json().error.code,
    ).toBe('reserve_aux_parents');
  });

  it('réinitialisation par e-mail : désactivée (fournisseur d’e-mail requis)', async () => {
    expect((await post('/api/v1/auth/password-reset', {})).json().error.code).toBe(
      'reinitialisation_desactivee',
    );
  });
});
