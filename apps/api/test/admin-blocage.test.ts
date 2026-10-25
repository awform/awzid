/** Blocage d'un compte par l'administrateur : réservé, un par un (e-mail ou numéro), sessions fermées, connexion refusée, audit. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { connect, resetTestDatabase, runMigrations, schema as t, type DbHandle } from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { chiffrer, phoneHashOf } from '../src/identites/cles.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

describe.skipIf(!URL)('blocage de compte (awform_test)', () => {
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
  const bloquer = (identifiant: string, bloquer: boolean, cookie = admin) =>
    req('POST', '/api/v1/admin/comptes/blocage', cookie, { identifiant, bloquer });
  const login = (email: string) => req('POST', '/api/v1/auth/login', '', { email, password: PW });
  const actions = async () =>
    (await h.db.select({ a: t.auditLog.action, target: t.auditLog.target }).from(t.auditLog)).map(
      (r) => `${r.a}:${r.target}`,
    );

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    app = buildApp({ db: h.db, secretKey: key });
    await app.ready();
    await h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.blocage@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    admin = cookieOf(await login('admin.blocage@exemple.org'));
    const s = (await req('POST', '/api/v1/auth/totp/setup', admin, {})).json();
    await req('POST', '/api/v1/auth/totp/confirm', admin, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  const inscrire = async (email: string) => {
    const r = await req('POST', '/api/v1/auth/signup', '', {
      kind: 'adulte',
      email,
      password: PW,
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
      birthYear: 1980,
      pseudonym: 'Moi',
    });
    expect(r.statusCode).toBeLessThan(300);
    return cookieOf(r);
  };

  it('réservé à l’administrateur (second facteur compris)', async () => {
    const adulte = await inscrire('adulte.blocage@exemple.org');
    expect((await bloquer('x@exemple.org', true, '')).json().error.code).toBe('non_connecte');
    expect((await bloquer('x@exemple.org', true, adulte)).json().error.code).toBe('reserve_admin');
    expect((await req('GET', '/api/v1/admin/comptes/bloques', adulte)).statusCode).toBe(403);
  });

  it('bloquer par e-mail : sessions fermées, connexion refusée, audit, liste masquée, puis débloquer', async () => {
    const email = 'eleve.bloque@exemple.org';
    const session = await inscrire(email);
    expect((await req('GET', '/api/v1/auth/me', session)).statusCode).toBe(200);

    const b = await bloquer('  Eleve.Bloque@Exemple.org ', true);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toMatchObject({ ok: true, change: true, bloque: true });
    // la session ouverte est fermée à l'instant
    expect((await req('GET', '/api/v1/auth/me', session)).statusCode).toBe(401);
    const [acc] = await h.db.select().from(t.account).where(eq(t.account.email, email));
    const ouvertes = (await h.db.select().from(t.session)).filter(
      (s) => s.accountId === acc!.id && !s.revokedAt,
    );
    expect(ouvertes).toHaveLength(0);
    // connexion refusée avec le bon mot de passe ; mauvais mot de passe : rien n'est révélé
    const l = await login(email);
    expect(l.statusCode).toBe(403);
    expect(l.json().error.code).toBe('compte_bloque');
    expect(l.headers['set-cookie']).toBeUndefined();
    expect(
      (await req('POST', '/api/v1/auth/login', '', { email, password: 'faux faux faux 99' })).json()
        .error.code,
    ).toBe('identifiants_incorrects');
    // audit et liste
    expect(await actions()).toContain(`compte.bloque:${acc!.id}`);
    const liste = (await req('GET', '/api/v1/admin/comptes/bloques', admin)).json();
    expect(liste.comptes.map((c: { id: string }) => c.id)).toContain(acc!.id);
    expect(JSON.stringify(liste)).not.toContain(email);
    // répéter ne change rien
    expect((await bloquer(email, true)).json().change).toBe(false);
    // débloquer : la connexion revient
    const u = await bloquer(email, false);
    expect(u.json()).toMatchObject({ ok: true, change: true, bloque: false });
    expect((await login(email)).statusCode).toBe(200);
    expect(await actions()).toContain(`compte.debloque:${acc!.id}`);
    const apres = (await req('GET', '/api/v1/admin/comptes/bloques', admin)).json();
    expect(apres.comptes.map((c: { id: string }) => c.id)).not.toContain(acc!.id);
  });

  it('bloquer par numéro de téléphone', async () => {
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
    const r = await bloquer('77 123 45 67', true);
    expect(r.statusCode).toBe(200);
    expect(r.json().change).toBe(true);
    const [apres] = await h.db.select().from(t.account).where(eq(t.account.id, acc!.id));
    expect(apres!.blockedAt).not.toBeNull();
    const liste = JSON.stringify((await req('GET', '/api/v1/admin/comptes/bloques', admin)).json());
    expect(liste).toContain('67');
    expect(liste).not.toContain('771234567');
    expect((await bloquer('+221771234567', false)).json().change).toBe(true);
  });

  it('refus : compte inconnu, requête invalide, son propre compte', async () => {
    expect((await bloquer('inconnu@exemple.org', true)).json().error.code).toBe('introuvable');
    expect((await bloquer('+221700000000', true)).statusCode).toBe(404);
    expect(
      (await req('POST', '/api/v1/admin/comptes/blocage', admin, { identifiant: '' })).statusCode,
    ).toBe(400);
    expect((await bloquer('admin.blocage@exemple.org', true)).json().error.code).toBe(
      'pas_soi_meme',
    );
    // un compte supprimé n'est plus trouvé
    await h.db.insert(t.account).values({
      kind: 'adulte',
      email: 'supprime.bl@exemple.org',
      passwordHash: 'x',
      deletedAt: new Date(),
    });
    expect((await bloquer('supprime.bl@exemple.org', true)).statusCode).toBe(404);
  });
});
