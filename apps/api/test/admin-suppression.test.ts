/** Suppression d'un compte par l'administrateur, à la demande de la personne : même mécanisme que « Supprimer mon compte ». */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
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
import { TEST_CONTENT_DIR } from './content.js';
import { chiffrer, phoneHashOf } from '../src/identites/cles.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const MOTIF = 'demande de la personne par WhatsApp le 28/10';
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

describe.skipIf(!URL)('suppression de compte par l’administrateur (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let admin = '';
  const key = randomBytes(32);
  const req = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  const supprimer = (over: Record<string, unknown>, cookie = admin) =>
    req('POST', '/api/v1/admin/comptes/suppression', cookie, {
      password: PW,
      motif: MOTIF,
      ...over,
    });
  const login = (email: string) => req('POST', '/api/v1/auth/login', '', { email, password: PW });
  const signupBody = (email: string, kind: 'adulte' | 'parent') => ({
    kind,
    email,
    password: PW,
    country: 'FR',
    consents: ['cgu', 'donnee_religieuse_art9'],
    birthYear: 1980,
    pseudonym: 'Moi',
  });
  const inscrire = async (email: string, kind: 'adulte' | 'parent' = 'adulte') => {
    const r = await req('POST', '/api/v1/auth/signup', '', signupBody(email, kind));
    expect(r.statusCode).toBeLessThan(300);
    return cookieOf(r);
  };

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1'], withRegistry: false }),
      { code: 'suppr', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: key });
    await app.ready();
    await h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.suppr@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    admin = cookieOf(await login('admin.suppr@exemple.org'));
    const s = (await req('POST', '/api/v1/auth/totp/setup', admin, {})).json();
    await req('POST', '/api/v1/auth/totp/confirm', admin, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('réservé à l’administrateur avec second facteur', async () => {
    const adulte = await inscrire('adulte.suppr@exemple.org');
    const cible = { identifiant: 'x@exemple.org', confirmation: 'x@exemple.org' };
    expect((await supprimer(cible, '')).json().error.code).toBe('non_connecte');
    expect((await supprimer(cible, adulte)).json().error.code).toBe('reserve_admin');
  });

  it('double confirmation et motif obligatoires, rien n’est supprimé tant qu’ils manquent', async () => {
    const email = 'confirm.suppr@exemple.org';
    await inscrire(email);
    const base = { identifiant: email, confirmation: email };
    expect(
      (await supprimer({ ...base, confirmation: 'autre@exemple.org' })).json().error.code,
    ).toBe('confirmation_incorrecte');
    expect((await supprimer({ ...base, confirmation: '' })).statusCode).toBe(400);
    expect((await supprimer({ ...base, motif: '' })).json().error.code).toBe('motif_requis');
    expect((await supprimer({ ...base, motif: 'ok' })).json().error.code).toBe('motif_requis');
    expect((await supprimer({ ...base, password: 'mauvais mot de passe 1' })).statusCode).toBe(401);
    expect((await supprimer({ ...base, password: undefined })).statusCode).toBe(400);
    const [a] = await h.db.select().from(t.account).where(eq(t.account.email, email));
    expect(a!.deletedAt).toBeNull();
    expect((await login(email)).statusCode).toBe(200);
  });

  it('mère : compte parent + profil enfant supprimés, adresse libre aussitôt, journal d’audit, effacement à 30 jours', async () => {
    const email = 'mere.suppr@exemple.org';
    const parent = await inscrire(email, 'parent');
    const enfant = await req('POST', '/api/v1/profiles', parent, {
      pseudonym: 'Petite étoile',
      birthYear: new Date().getFullYear() - 7,
      avatar: 'etoile',
      levelCode: 'en1',
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
      password: PW,
    });
    expect(enfant.statusCode, enfant.body).toBe(201);
    const [acc] = await h.db.select().from(t.account).where(eq(t.account.email, email));
    expect(
      await h.db.select().from(t.profile).where(eq(t.profile.ownerAccountId, acc!.id)),
    ).not.toHaveLength(0);

    const r = await supprimer({ identifiant: `  ${email.toUpperCase()} `, confirmation: email });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    expect(new Date(r.json().effacementDefinitif).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400_000,
    );
    // accès coupé, adresse libérée aussitôt
    expect((await req('GET', '/api/v1/auth/me', parent)).statusCode).toBe(401);
    expect((await login(email)).statusCode).toBe(401);
    const [apres] = await h.db.select().from(t.account).where(eq(t.account.id, acc!.id));
    expect(apres!.deletedAt).not.toBeNull();
    expect(apres!.email).toBeNull();
    // la même adresse sert tout de suite à un nouveau compte ADULTE
    const nouveau = await req('POST', '/api/v1/auth/signup', '', signupBody(email, 'adulte'));
    expect(nouveau.statusCode).toBe(201);
    // journal : qui, quand, quel compte (masqué), quel motif
    const [ligne] = (await h.db.select().from(t.auditLog)).filter(
      (l) => l.action === 'compte.suppression_admin' && l.target === acc!.id,
    );
    expect(ligne).toBeDefined();
    expect(ligne!.actorAccountId).not.toBeNull();
    expect(ligne!.at).toBeInstanceOf(Date);
    expect(ligne!.after).toMatchObject({
      kind: 'parent',
      motif: MOTIF,
      contact: 'm…r@exemple.org',
    });
    expect(JSON.stringify(ligne!.after)).not.toContain(email);
    // profils d'enfants : effacés avec le compte par la purge de nuit (même travailleur que le flux utilisateur)
    expect(await purgeDeletedAccounts(h.db, 30, new Date(Date.now() + 31 * 86400_000))).toBe(1);
    expect(
      await h.db.select().from(t.profile).where(eq(t.profile.ownerAccountId, acc!.id)),
    ).toHaveLength(0);
    expect(await h.db.select().from(t.account).where(eq(t.account.id, acc!.id))).toHaveLength(0);
  });

  it('même effet côté utilisateur : « Supprimer mon compte » libère l’adresse aussitôt', async () => {
    const email = 'soi.suppr@exemple.org';
    const c = await inscrire(email);
    const r = await req('POST', '/api/v1/account/delete', c, { password: PW });
    expect(r.statusCode).toBe(200);
    expect(
      (await req('POST', '/api/v1/auth/signup', '', signupBody(email, 'adulte'))).statusCode,
    ).toBe(201);
  });

  it('par numéro : confirmation par les 4 derniers chiffres, numéro libéré', async () => {
    const e164 = '+221771234567';
    const [acc] = await h.db
      .insert(t.account)
      .values({
        kind: 'adulte',
        passwordHash: await hashSecret(PW),
        country: 'SN',
        phoneEnc: chiffrer(key, e164),
        phoneHash: phoneHashOf(key, e164),
      })
      .returning({ id: t.account.id });
    expect(
      (await supprimer({ identifiant: '77 123 45 67', confirmation: '1111' })).json().error.code,
    ).toBe('confirmation_incorrecte');
    const r = await supprimer({ identifiant: '77 123 45 67', confirmation: '4567' });
    expect(r.statusCode).toBe(200);
    const [apres] = await h.db.select().from(t.account).where(eq(t.account.id, acc!.id));
    expect(apres).toMatchObject({ phoneEnc: null, phoneHash: null });
    expect(apres!.deletedAt).not.toBeNull();
    const [ligne] = (await h.db.select().from(t.auditLog)).filter(
      (l) => l.action === 'compte.suppression_admin' && l.target === acc!.id,
    );
    expect(JSON.stringify(ligne!.after)).not.toContain('771234567');
  });

  it('refus : personnel, son propre compte, compte inconnu ou déjà supprimé', async () => {
    for (const [kind, email] of [
      ['enseignant', 'prof.suppr@exemple.org'],
      ['admin', 'autre.admin.suppr@exemple.org'],
    ] as const) {
      await h.db
        .insert(t.account)
        .values({ kind, email, passwordHash: await hashSecret(PW), country: 'FR' });
      expect((await supprimer({ identifiant: email, confirmation: email })).json().error.code).toBe(
        'compte_personnel',
      );
      const [a] = await h.db.select().from(t.account).where(eq(t.account.email, email));
      expect(a!.deletedAt).toBeNull();
    }
    // un rôle de personnel (support) sur un compte ordinaire : refusé aussi
    const [sup] = await h.db
      .insert(t.account)
      .values({
        kind: 'adulte',
        email: 'support.suppr@exemple.org',
        passwordHash: await hashSecret(PW),
        country: 'FR',
      })
      .returning({ id: t.account.id });
    await h.db.insert(t.accountRole).values({ accountId: sup!.id, role: 'support' });
    expect(
      (
        await supprimer({
          identifiant: 'support.suppr@exemple.org',
          confirmation: 'support.suppr@exemple.org',
        })
      ).json().error.code,
    ).toBe('compte_personnel');
    expect(
      (
        await supprimer({
          identifiant: 'admin.suppr@exemple.org',
          confirmation: 'admin.suppr@exemple.org',
        })
      ).json().error.code,
    ).toBe('pas_soi_meme');
    expect(
      (await supprimer({ identifiant: 'inconnu@exemple.org', confirmation: 'inconnu@exemple.org' }))
        .statusCode,
    ).toBe(404);
    await h.db.insert(t.account).values({
      kind: 'adulte',
      email: 'deja.suppr@exemple.org',
      passwordHash: 'x',
      deletedAt: new Date(),
    });
    expect(
      (
        await supprimer({
          identifiant: 'deja.suppr@exemple.org',
          confirmation: 'deja.suppr@exemple.org',
        })
      ).statusCode,
    ).toBe(404);
  });
});
