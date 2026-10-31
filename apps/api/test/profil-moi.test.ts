/**
 * V2-3 — profil « Moi » du parent (choix « Moi et mes enfants ») : unicité, intention famille / enfants, POST /profiles/moi.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();

describe.skipIf(!URL)('profil « Moi » du parent (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const cookieOf = (r: LightMyRequestResponse) =>
    String(
      (Array.isArray(r.headers['set-cookie'])
        ? r.headers['set-cookie'][0]
        : r.headers['set-cookie']) ?? '',
    ).split(';')[0] ?? '';
  const appel = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      payload,
      headers: { 'x-awform': '1', ...(cookie ? { cookie } : {}) },
    });
  const inscrire = async (email: string, intention?: string, over: object = {}) => {
    const r = await appel('POST', '/api/v1/auth/signup', '', {
      kind: 'parent',
      email,
      password: PW,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
      ...(intention ? { intention } : {}),
      ...over,
    });
    expect(r.statusCode).toBe(201);
    return { cookie: cookieOf(r), id: r.json().account.id as string };
  };
  const profils = (accountId: string) =>
    h.db.select().from(t.profile).where(eq(t.profile.ownerAccountId, accountId));

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'moi', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('intention « famille » : le parent a son profil Moi (adulte, adulte à vie), pas les enfants', async () => {
    const f = await inscrire('famille.moi@exemple.org', 'famille', { pseudonym: 'Maman' });
    const [moi] = await profils(f.id);
    expect(moi).toMatchObject({
      kind: 'adulte',
      isOwner: true,
      pseudonym: 'Maman',
      birthYear: 1985,
    });
    expect((await profils(f.id)).length).toBe(1);
    const me = (await appel('GET', '/api/v1/auth/me', f.cookie)).json();
    expect(me.profiles).toHaveLength(1);
    expect(me.profiles[0]).toMatchObject({ kind: 'adulte', isOwner: true });
  });

  it('intention « enfants » (ou absente) : aucun profil Moi', async () => {
    const e = await inscrire('enfants.seuls@exemple.org', 'enfants');
    const s = await inscrire('sans.intention@exemple.org');
    expect(await profils(e.id)).toHaveLength(0);
    expect(await profils(s.id)).toHaveLength(0);
  });

  it('POST /profiles/moi : une seule fois, majeur seulement, parent seulement', async () => {
    const e = await inscrire('plus.tard@exemple.org', 'enfants');
    expect(
      (await appel('POST', '/api/v1/profiles/moi', e.cookie, { birthYear: YEAR - 15 })).json().error
        .code,
    ).toBe('majorite_requise');
    const ok = await appel('POST', '/api/v1/profiles/moi', e.cookie, { birthYear: 1985 });
    expect(ok.statusCode).toBe(201);
    const [moi] = await profils(e.id);
    expect(moi).toMatchObject({
      id: ok.json().id,
      kind: 'adulte',
      isOwner: true,
      pseudonym: 'Moi',
    });
    const encore = await appel('POST', '/api/v1/profiles/moi', e.cookie, { birthYear: 1985 });
    expect(encore.statusCode).toBe(409);
    expect(encore.json().error.code).toBe('profil_moi_existe');
    expect(await profils(e.id)).toHaveLength(1);
    // famille : déjà un Moi → refus aussi
    const f = await inscrire('deja.famille@exemple.org', 'famille');
    expect(
      (await appel('POST', '/api/v1/profiles/moi', f.cookie, { birthYear: 1985 })).statusCode,
    ).toBe(409);
    // pas connecté / compte adulte : refus
    expect((await appel('POST', '/api/v1/profiles/moi', '', { birthYear: 1985 })).statusCode).toBe(
      401,
    );
    const ad = await appel('POST', '/api/v1/auth/signup', '', {
      kind: 'adulte',
      email: 'adulte.seul@exemple.org',
      password: PW,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    });
    expect(
      (await appel('POST', '/api/v1/profiles/moi', cookieOf(ad), { birthYear: 1985 })).statusCode,
    ).toBe(403);
  });

  it('unicité en base : un second profil Moi est impossible, un profil Moi d’enfant aussi', async () => {
    const f = await inscrire('base.unique@exemple.org', 'famille');
    await expect(
      h.db.insert(t.profile).values({
        ownerAccountId: f.id,
        kind: 'adulte',
        isOwner: true,
        pseudonym: 'Bis',
        birthYear: 1985,
      }),
    ).rejects.toThrow();
    await expect(
      h.db.insert(t.profile).values({
        ownerAccountId: f.id,
        kind: 'enfant',
        isOwner: true,
        pseudonym: 'Petit',
        birthYear: YEAR - 8,
      }),
    ).rejects.toThrow();
    // les profils d'enfants ordinaires ne sont pas concernés : plusieurs sont permis
    const e1 = await appel('POST', '/api/v1/profiles', f.cookie, {
      pseudonym: 'A',
      birthYear: YEAR - 8,
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    const e2 = await appel('POST', '/api/v1/profiles', f.cookie, {
      pseudonym: 'B',
      birthYear: YEAR - 9,
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    expect([e1.statusCode, e2.statusCode]).toEqual([201, 201]);
  });

  it('le refus « adulte_compte_personnel » reste en place pour POST /profiles (seule la route Moi le lève)', async () => {
    const f = await inscrire('refus.adulte@exemple.org', 'famille');
    const r = await appel('POST', '/api/v1/profiles', f.cookie, {
      pseudonym: 'Grand',
      birthYear: 1990,
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    expect(r.json().error.code).toBe('adulte_compte_personnel');
  });
});
