/**
 * Hifẓ complet — carte des erreurs : marques par verset et par mot (migration 0046, table hifz_mark), écrites par
 * la file hors ligne commune (type « hifz_marque »), relues par le titulaire du profil seulement ; journal en
 * ajout seul, idempotent, bornes contrôlées d'après le texte importé.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

describe.skipIf(!READY)('hifẓ complet : carte des erreurs (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let parent = '';
  let other = '';
  let child = '';

  const req = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  let n = 0;
  const marque = (response: object, id = randomUUID()) => ({
    id,
    profileId: child,
    unitId: 'hifz',
    eventType: 'hifz_marque',
    response,
    // horodatages distincts : l'ordre du journal suit l'heure de l'appareil
    deviceAt: new Date(Date.now() - 60_000 + ++n * 1000).toISOString(),
  });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'marques', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    const signup = async (email: string) =>
      cookieOf(
        await req('POST', '/api/v1/auth/signup', '', {
          kind: 'parent',
          birthYear: 1985,
          email,
          password: PW,
          country: 'FR',
          consents: ['cgu', 'donnee_religieuse_art9'],
        }),
      );
    parent = await signup('parent.marques@exemple.org');
    other = await signup('autre.marques@exemple.org');
    const r = await req('POST', '/api/v1/profiles', parent, {
      pseudonym: 'Maryam',
      birthYear: YEAR - 9,
      levelCode: 'en1',
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    child = r.json().id;
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('la migration crée la table hifz_mark avec ses contraintes', async () => {
    const r = await h.pool.query<{ conname: string }>(
      "select conname from pg_constraint where conrelid = 'hifz_mark'::regclass order by 1",
    );
    const names = r.rows.map((x) => x.conname);
    for (const c of ['hifz_mark_kind', 'hifz_mark_source', 'hifz_mark_word', 'hifz_mark_aya'])
      expect(names).toContain(c);
  });

  it('marques par verset et par mot : envoyées par la file, relues dans l’ordre, idempotentes', async () => {
    const id = randomUUID();
    const events = [
      marque({ day: TODAY, s: 112, a: 1, k: 2, t: 'erreur', src: 'test' }, id),
      marque({ day: TODAY, s: 112, a: 2, k: -1, t: 'hesitation', src: 'test' }),
      marque({ day: TODAY, s: 112, a: 3, k: -1, t: 'juste', src: 'auto' }),
    ];
    const r = await req('POST', '/api/v1/attempts', parent, { events });
    expect(r.statusCode).toBe(200);
    expect(r.json().accepted).toHaveLength(3);
    // renvoi (réseau coupé pendant la réponse) : doublon, jamais deux lignes
    const again = await req('POST', '/api/v1/attempts', parent, { events: [events[0]] });
    expect(again.json().duplicates).toEqual([id]);
    const list = await req('GET', `/api/v1/hifz/profiles/${child}/marques`, parent);
    expect(list.statusCode).toBe(200);
    const m = list.json().marques as Array<{ s: number; a: number; k: number; t: string }>;
    expect(m.map((x) => [x.s, x.a, x.k, x.t])).toEqual([
      [112, 1, 2, 'erreur'],
      [112, 2, -1, 'hesitation'],
      [112, 3, -1, 'juste'],
    ]);
  });

  it('refuse les marques hors bornes (verset inexistant, type ou source inconnus)', async () => {
    const r = await req('POST', '/api/v1/attempts', parent, {
      events: [
        marque({ day: TODAY, s: 112, a: 287, k: -1, t: 'erreur', src: 'test' }),
        marque({ day: TODAY, s: 115, a: 1, k: -1, t: 'erreur', src: 'test' }),
        marque({ day: TODAY, s: 1, a: 1, k: -2, t: 'erreur', src: 'test' }),
        marque({ day: TODAY, s: 1, a: 1, k: 0, t: 'note', src: 'test' }),
        marque({ day: TODAY, s: 1, a: 1, k: 0, t: 'erreur', src: 'enseignant' }),
        marque({ day: 'hier', s: 1, a: 1, k: 0, t: 'erreur', src: 'test' }),
      ],
    });
    expect(r.json().accepted).toHaveLength(0);
    expect(r.json().rejected).toHaveLength(6);
  });

  it('un autre compte ne lit ni n’écrit les marques du profil', async () => {
    expect((await req('GET', `/api/v1/hifz/profiles/${child}/marques`, other)).statusCode).toBe(
      404,
    );
    expect((await req('GET', `/api/v1/hifz/profiles/${child}/marques`)).statusCode).toBe(401);
    const r = await req('POST', '/api/v1/attempts', other, {
      events: [marque({ day: TODAY, s: 1, a: 1, k: 0, t: 'erreur', src: 'test' })],
    });
    expect(r.json().accepted).toHaveLength(0);
    expect(r.json().rejected[0].code).toBe('autre_compte');
  });
});
