/**
 * V2-3 — correctifs de la relecture indépendante de la session limitée (enfant-login.ts) :
 * B1 (déni de service du parcours du corps, tajwīd), I1 (niveaux en lecture), I2 (limite de disponibilité),
 * I3b (ressaisie du mot de passe du parent), I4 (code parent jamais consulté par l'enfant, positionnement),
 * M1 (champs du signalement), M2 (aucun rôle, aucun autre profil).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { autoriseEnfant, signalementEnfantOk } from '../src/auth/enfant-login.js';
import { ownsProfile } from '../src/auth/routes.js';
import { lookupSession } from '../src/auth/service.js';
import { parentGate } from '../src/guards.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const PW_ENFANT = 'soleil-vert-42';
const YEAR = new Date().getUTCFullYear();

describe('session limitée : revue (sans base)', () => {
  const me = randomUUID();
  const autre = randomUUID();
  const ok = (m: string, u: string, corps?: unknown) => autoriseEnfant(m, u, me, corps);

  it('B1 : un corps Buffer de 4 Mo est traité en moins de 50 ms, comme un Uint8Array ou une Map', () => {
    for (const corps of [
      Buffer.alloc(4 * 1024 * 1024, 97),
      new Uint8Array(4 * 1024 * 1024),
      new Map([['profile_id', autre]]),
    ]) {
      const t0 = performance.now();
      const r = ok('POST', '/api/v1/attempts', corps);
      expect(performance.now() - t0).toBeLessThan(50);
      expect(r).toBe(true); // rien à y lire : la route reste permise, le serveur contrôle le profil
    }
  });

  it('B1 : un objet géant est borné (200 clés), la profondeur aussi (5), mais un profil étranger proche est vu', () => {
    const geant: Record<string, number> = {};
    for (let i = 0; i < 200_000; i++) geant['k' + i] = i;
    const t0 = performance.now();
    ok('POST', '/api/v1/sync', geant);
    expect(performance.now() - t0).toBeLessThan(50);
    const tableau = Array.from({ length: 200_000 }, (_, i) => ({ i }));
    const t1 = performance.now();
    ok('POST', '/api/v1/sync', { ops: tableau });
    expect(performance.now() - t1).toBeLessThan(50);
    expect(ok('POST', '/api/v1/sync', { ops: [{ a: { b: { profile_id: autre } } }] })).toBe(false);
    expect(ok('POST', '/api/v1/sync', { profile_id: me })).toBe(true);
  });

  it('B1 : le tajwīd (madd) est réservé aux adultes — lecture seulement, jamais d’écriture', () => {
    expect(ok('POST', `/api/v1/profiles/${me}/tajwid/madd`, {})).toBe(false);
    expect(ok('PUT', `/api/v1/profiles/${me}/tajwid/madd`, {})).toBe(false);
    expect(ok('GET', `/api/v1/profiles/${me}/tajwid/madd`)).toBe(true);
  });

  it('I1 : les niveaux sont en lecture seule (PUT refusé, GET permis)', () => {
    expect(ok('PUT', `/api/v1/profiles/${me}/niveaux`, { levels: [] })).toBe(false);
    expect(ok('POST', `/api/v1/profiles/${me}/niveaux`, {})).toBe(false);
    expect(ok('GET', `/api/v1/profiles/${me}/niveaux`)).toBe(true);
  });

  it('I4 : le positionnement (qui peut relever le niveau) est une décision du parent', () => {
    expect(ok('POST', `/api/v1/profiles/${me}/positionnement/ar/en1`, {})).toBe(false);
    // (la lecture reste permise : les pages /lectures, /revisions, /sciences la font)
    expect(ok('GET', `/api/v1/profiles/${me}/positionnement`)).toBe(true);
    // l'apprentissage, lui, reste permis
    expect(ok('POST', `/api/v1/profiles/${me}/reponses-libres`, {})).toBe(true);
    expect(ok('POST', `/api/v1/profiles/${me}/epreuve/ar`, {})).toBe(true);
  });

  it('M1 : signalement en session limitée — seuls targetKind, unitId, path, fp, reason, edition', () => {
    const base = { targetKind: 'texte', unitId: 'en1.l01', reason: 'orthographe' };
    expect(signalementEnfantOk(base)).toBe(true);
    expect(signalementEnfantOk({ ...base, path: 'a/b', fp: '0123abcd', edition: 'e2e' })).toBe(
      true,
    );
    for (const extra of [{ ref: 'x' }, { comment: 'x' }, { excerpt: 'x' }, { autre: 1 }])
      expect(signalementEnfantOk({ ...base, ...extra }), JSON.stringify(extra)).toBe(false);
    expect(signalementEnfantOk({ ...base, reason: 'texte libre' })).toBe(false);
    expect(signalementEnfantOk(Buffer.from('x'))).toBe(false);
    expect(signalementEnfantOk([base])).toBe(false);
    expect(ok('POST', '/api/v1/contenu/signalements', { ...base, ref: 'x' })).toBe(false);
    expect(ok('POST', '/api/v1/contenu/signalements', base)).toBe(true);
  });
});

describe.skipIf(!URL)('session limitée : revue (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const H = { 'x-awform': '1' };
  const cookieOf = (r: LightMyRequestResponse) =>
    String(
      (Array.isArray(r.headers['set-cookie'])
        ? r.headers['set-cookie'][0]
        : r.headers['set-cookie']) ?? '',
    ).split(';')[0] ?? '';
  const appel = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    cookie = '',
    payload?: object,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: { ...H, ...extra, ...(cookie ? { cookie } : {}) },
    });
  const parent = async (email: string) => {
    const r = await appel('POST', '/api/v1/auth/signup', '', {
      kind: 'parent',
      email,
      password: PW,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    });
    expect(r.statusCode).toBe(201);
    return cookieOf(r);
  };
  const corpsEnfant = (identifiant: string, over: object = {}) => ({
    pseudonym: 'Lina',
    birthYear: YEAR - 9,
    identifiant,
    motDePasseEnfant: PW_ENFANT,
    declaration: true,
    consents: ['compte_suivi', 'donnee_religieuse_art9'],
    ...over,
  });
  const connexion = (identifiant: string) =>
    appel('POST', '/api/v1/auth/login', '', { email: identifiant, password: PW_ENFANT });

  let cookieParent = '';
  let idEnfant = '';
  let idFrere = '';
  let cookieEnfant = '';
  let accountParent = '';

  beforeAll(async () => {
    h = connect(URL!, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'enfant-login-revue', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    cookieParent = await parent('revue.parent@exemple.org');
    const a = await appel('POST', '/api/v1/profiles', cookieParent, {
      ...corpsEnfant('lina-482'),
      password: PW,
    });
    expect(a.statusCode).toBe(201);
    idEnfant = a.json().id;
    const b = await appel('POST', '/api/v1/profiles', cookieParent, {
      ...corpsEnfant('omar-316', { pseudonym: 'Omar' }),
      password: PW,
    });
    idFrere = b.json().id;
    cookieEnfant = cookieOf(await connexion('lina-482'));
    const [acc] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'revue.parent@exemple.org'));
    accountParent = acc!.id;
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('B1 : POST tajwid/madd refusé en session limitée (403 session_limitee)', async () => {
    // la route reçoit de l'audio brut (Buffer) : c'est le corps que la garde parcourait sans le vérifier
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${idEnfant}/tajwid/madd?s=1&a=1&k=0&type=madd`,
      payload: Buffer.alloc(100_000, 1),
      headers: { ...H, cookie: cookieEnfant, 'content-type': 'application/octet-stream' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('session_limitee');
  });

  it('I1 : PUT /profiles/<id>/niveaux refusé en session limitée, GET permis', async () => {
    const put = await appel('PUT', `/api/v1/profiles/${idEnfant}/niveaux`, cookieEnfant, {
      levels: ['en1'],
      source: 'parent',
    });
    expect(put.statusCode).toBe(403);
    expect(put.json().error.code).toBe('session_limitee');
    const get = await appel('GET', `/api/v1/profiles/${idEnfant}/niveaux`, cookieEnfant);
    expect(get.statusCode).not.toBe(403);
  });

  it('I4 : positionnement refusé en session limitée', async () => {
    const r = await appel(
      'POST',
      `/api/v1/profiles/${idEnfant}/positionnement/ar/en1`,
      cookieEnfant,
      {},
    );
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('session_limitee');
  });

  it('M1 : signalement de l’enfant — `ref` et tout autre champ refusés', async () => {
    const base = { targetKind: 'texte', unitId: 'en1.l01', reason: 'orthographe' };
    for (const extra of [{ ref: 'x' }, { comment: 'x' }, { autre: 1 }]) {
      const r = await appel('POST', '/api/v1/contenu/signalements', cookieEnfant, {
        ...base,
        ...extra,
      });
      expect(r.statusCode, JSON.stringify(extra)).toBe(403);
      expect(r.json().error.code).toBe('session_limitee');
    }
  });

  it('M2 : la session de l’enfant n’a AUCUN rôle ; ownsProfile refuse tout autre profil, même du même parent', async () => {
    await h.db.insert(t.accountRole).values({ accountId: accountParent, role: 'support' });
    const jeton = (c: string) => c.slice(c.indexOf('=') + 1);
    const sp = await lookupSession(h.db, jeton(cookieParent));
    const se = await lookupSession(h.db, jeton(cookieEnfant));
    expect(sp!.roles.length).toBeGreaterThan(0);
    expect(sp!.profileId).toBeNull();
    expect(se!.profileId).toBe(idEnfant);
    expect(se!.roles).toEqual([]);
    expect(await ownsProfile(h.db, sp, idFrere)).toBe(true);
    expect(await ownsProfile(h.db, se, idEnfant)).toBe(true);
    expect(await ownsProfile(h.db, se, idFrere)).toBe(false);
    await h.db
      .delete(t.accountRole)
      .where(and(eq(t.accountRole.accountId, accountParent), eq(t.accountRole.role, 'support')));
  });

  it('I3b : créer un profil avec identifiant exige la ressaisie du mot de passe du parent', async () => {
    const sans = await appel('POST', '/api/v1/profiles', cookieParent, corpsEnfant('zaid-111'));
    expect(sans.statusCode).toBe(400);
    expect(sans.json().error.code).toBe('mot_de_passe_requis');
    const faux = await appel('POST', '/api/v1/profiles', cookieParent, {
      ...corpsEnfant('zaid-111'),
      password: 'un mauvais mot de passe 2026',
    });
    expect(faux.statusCode).toBe(401);
    expect(faux.json().error.code).toBe('mot_de_passe_incorrect');
    const bon = await appel('POST', '/api/v1/profiles', cookieParent, {
      ...corpsEnfant('zaid-111'),
      password: PW,
    });
    expect(bon.statusCode).toBe(201);
  });

  it('I3b : /acces (créer, nouveau mot de passe, débloquer) exige la ressaisie ; le code parent la remplace', async () => {
    const acces = (over: object, extra: Record<string, string> = {}) =>
      appel('POST', `/api/v1/profiles/${idEnfant}/acces`, cookieParent, over, extra);
    for (const corps of [{ debloquer: true }, { motDePasse: 'nuage-bleu-77' }]) {
      const sans = await acces(corps);
      expect(sans.statusCode).toBe(400);
      expect(sans.json().error.code).toBe('mot_de_passe_requis');
      const faux = await acces({ ...corps, password: 'un mauvais mot de passe 2026' });
      expect(faux.statusCode).toBe(401);
    }
    expect((await connexion('lina-482')).statusCode).toBe(200); // rien n'a changé
    expect((await acces({ debloquer: true, password: PW })).statusCode).toBe(200);
    // création pour un profil sans identifiant
    const e = await appel('POST', '/api/v1/profiles', cookieParent, {
      pseudonym: 'Samir',
      birthYear: YEAR - 11,
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    const sid = e.json().id as string;
    const creation = { identifiant: 'samir-217', motDePasse: PW_ENFANT, declaration: true };
    const cree = (over: object) =>
      appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, { ...creation, ...over });
    expect((await cree({})).json().error.code).toBe('mot_de_passe_requis');
    expect((await cree({ password: 'un mauvais mot de passe 2026' })).statusCode).toBe(401);
    expect((await cree({ password: PW })).statusCode).toBe(201);
    // code parent : il remplace le mot de passe (même contrôle que parentGate)
    expect(
      (await appel('POST', '/api/v1/account/pin', cookieParent, { pin: '4821', password: PW }))
        .statusCode,
    ).toBe(200);
    expect((await acces({ debloquer: true }, { 'x-parent-pin': '0000' })).statusCode).toBe(401);
    expect((await acces({ debloquer: true }, { 'x-parent-pin': '4821' })).statusCode).toBe(200);
  });

  it('I4 : en session limitée, le code parent n’est jamais consulté ni compté ; l’apprentissage passe sans code', async () => {
    const cleCompteur = `pin:${accountParent}`;
    const lignes = () =>
      h.db.select().from(t.authThrottle).where(eq(t.authThrottle.key, cleCompteur));
    // un code parent existe (posé au test précédent) ; l'enfant n'a aucune prise sur lui
    for (let i = 0; i < 12; i++) {
      const envoye: Array<{ status: number; corps: unknown }> = [];
      const reply = {
        code(status: number) {
          return { send: (corps: unknown) => void envoye.push({ status, corps }) };
        },
      };
      const req = {
        auth: { accountId: accountParent, profileId: idEnfant },
        headers: { 'x-parent-pin': String(1000 + i) },
      };
      const passe = await parentGate(h.db, req as never, reply as never, 'enfant');
      expect(passe).toBe(false);
      expect(envoye).toEqual([{ status: 403, corps: { error: { code: 'session_limitee' } } }]);
      // les routes d'apprentissage de SON profil passent sans code
      expect(await parentGate(h.db, req as never, reply as never, 'enfant', true)).toBe(true);
    }
    expect(await lignes()).toHaveLength(0);
    // le parent n'est donc pas bloqué
    const parentOk = await appel('POST', '/api/v1/account/pin/verify', cookieParent, {
      pin: '4821',
    });
    expect(parentOk.statusCode).toBe(200);
    // l'apprentissage de SON profil passe la garde sans code (la suite de la route répond autre chose que 401/429)
    for (const [u, corps] of [
      [`/api/v1/profiles/${idEnfant}/epreuves/${randomUUID()}/copie`, { answers: {} }],
      [`/api/v1/profiles/${idEnfant}/reponses-libres`, { answer: 'x' }],
    ] as const) {
      const r = await appel('POST', u, cookieEnfant, corps);
      expect(r.json()?.error?.code, u).not.toBe('code_parent_incorrect');
      expect(r.json()?.error?.code, u).not.toBe('verrouille');
      expect(r.json()?.error?.code, u).not.toBe('session_limitee');
    }
    expect(await lignes()).toHaveLength(0);
  });

  it('I2 : disponibilité de l’identifiant — 20 demandes par heure et par compte, 429 au-delà, tracé au journal', async () => {
    const c = await parent('enumere.parent@exemple.org');
    for (let i = 0; i < 20; i++) {
      const r = await appel('GET', `/api/v1/profiles/login-disponible?login=essai-${i}a`, c);
      expect(r.statusCode, String(i)).toBe(200);
    }
    const trop = await appel('GET', '/api/v1/profiles/login-disponible?login=essai-21a', c);
    expect(trop.statusCode).toBe(429);
    // un autre compte n'est pas touché
    expect(
      (await appel('GET', '/api/v1/profiles/login-disponible?login=essai-1b', cookieParent))
        .statusCode,
    ).toBe(200);
    const [acc] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'enumere.parent@exemple.org'));
    const journal = await h.db
      .select({ action: t.auditLog.action })
      .from(t.auditLog)
      .where(eq(t.auditLog.actorAccountId, acc!.id));
    expect(journal.filter((j) => j.action === 'profil.login_disponible')).toHaveLength(20);
    expect(journal.some((j) => j.action === 'profil.login_disponible_limite')).toBe(true);
  });
});
