/**
 * V2-2 (partie 1) — « Qui va apprendre ? » : l'intention choisie fixe le type de compte à l'inscription.
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
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const PW_PERSONNEL = 'une phrase de passe de douze+ caractères';

describe.skipIf(!URL)('inscription : intention « Qui va apprendre ? » (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;

  const signup = (email: string, over: object = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: { 'x-awform': '1' },
      payload: {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        ...over,
      },
    });
  const compte = async (email: string) => {
    const [a] = await h.db.select().from(t.account).where(eq(t.account.email, email));
    const profils = a
      ? await h.db.select().from(t.profile).where(eq(t.profile.ownerAccountId, a.id))
      : [];
    return { a, profils };
  };

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'intention', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('moi → compte adulte + profil adulte', async () => {
    const r = await signup('moi@exemple.org', {
      intention: 'moi',
      kind: 'parent',
      pseudonym: 'Aïcha',
    });
    expect(r.statusCode).toBe(201);
    const { a, profils } = await compte('moi@exemple.org');
    expect(a?.kind).toBe('adulte');
    expect(a?.signupIntent).toBe('moi');
    expect(profils).toHaveLength(1);
    expect(profils[0]?.kind).toBe('adulte');
  });

  it.each(['enfants', 'famille'] as const)('%s → compte parent, aucun profil créé', async (i) => {
    const r = await signup(`${i}@exemple.org`, { intention: i, kind: 'adulte' });
    expect(r.statusCode).toBe(201);
    const { a, profils } = await compte(`${i}@exemple.org`);
    expect(a?.kind).toBe('parent');
    expect(a?.signupIntent).toBe(i);
    expect(profils).toHaveLength(0);
  });

  it('eleves → enseignant : 12 caractères exigés, second facteur à configurer', async () => {
    const court = await signup('ens@exemple.org', {
      intention: 'eleves',
      password: 'phrase 11 c',
    });
    expect(court.statusCode).toBe(400);
    expect(court.json().error.code).toMatch(/^mot_de_passe_/);
    const r = await signup('ens@exemple.org', { intention: 'eleves', password: PW_PERSONNEL });
    expect(r.statusCode).toBe(201);
    const { a, profils } = await compte('ens@exemple.org');
    expect(a?.kind).toBe('enseignant');
    expect(a?.signupIntent).toBe('eleves');
    expect(profils).toHaveLength(0);
    const cookie = String(r.headers['set-cookie']).split(';')[0] ?? '';
    const prot = await app.inject({ method: 'GET', url: '/api/v1/profiles', headers: { cookie } });
    expect(prot.statusCode).toBe(403);
    expect(prot.json().error.code).toBe('mfa_a_configurer');
  });

  it('un enseignant mineur est refusé (majorité requise)', async () => {
    const r = await signup('ensmineur@exemple.org', {
      intention: 'eleves',
      password: PW_PERSONNEL,
      birthYear: new Date().getUTCFullYear() - 15,
    });
    expect(r.statusCode).toBe(403);
  });

  it("absence d'intention : comportement d'avant, rien d'enregistré", async () => {
    const r = await signup('sans@exemple.org', { kind: 'parent' });
    expect(r.statusCode).toBe(201);
    const { a } = await compte('sans@exemple.org');
    expect(a?.kind).toBe('parent');
    expect(a?.signupIntent).toBeNull();
  });

  it('valeur inconnue refusée', async () => {
    const r = await signup('inconnue@exemple.org', { intention: 'admin' });
    expect(r.statusCode).toBe(400);
    expect((await compte('inconnue@exemple.org')).a).toBeUndefined();
  });

  it('règles de mineurs inchangées : un adulte de moins de 13 ans (États-Unis) reste fermé', async () => {
    const r = await signup('us@exemple.org', {
      intention: 'moi',
      country: 'US',
      birthYear: new Date().getUTCFullYear() - 10,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('ferme_moins_13');
  });
});
