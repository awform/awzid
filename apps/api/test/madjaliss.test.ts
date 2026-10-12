/**
 * Madjaliss (P3-1) — séances faites : écrites par la file hors ligne commune (événement « madjlis », journal de
 * l'entraînement `practice_event`, migration 0047), relues par le compte du profil seulement (tous appareils),
 * idempotentes ; item contrôlé (« texte:numéro »).
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

describe.skipIf(!READY)('Madjaliss : séances faites (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let parent = '';
  let other = '';
  let ado = '';

  const req = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  let n = 0;
  const seance = (item: string, id = randomUUID(), extra: object = {}) => ({
    id,
    profileId: ado,
    unitId: 'madjaliss',
    eventType: 'madjlis',
    response: { item, ok: true, day: TODAY, details: { quiz: 4, sur: 5 }, ...extra },
    deviceAt: new Date(Date.now() - 60_000 + ++n * 1000).toISOString(),
  });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'madjaliss', publish: true },
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
    parent = await signup('parent.madjaliss@exemple.org');
    other = await signup('autre.madjaliss@exemple.org');
    const r = await req('POST', '/api/v1/profiles', parent, {
      pseudonym: 'Aminata',
      birthYear: YEAR - 9,
      levelCode: 'en1',
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    ado = r.json().id;
    expect(ado).toBeTruthy();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('la migration 0047 accepte le genre « madjlis » (et seulement les genres connus)', async () => {
    const r = await h.pool.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'practice_event_kind'",
    );
    expect(r.rows[0]?.def).toContain('madjlis');
    expect(r.rows[0]?.def).toContain('carte');
  });

  it('séances faites : envoyées par la file, relues (tous appareils), idempotentes', async () => {
    expect((await req('GET', `/api/v1/profiles/${ado}/madjaliss`, parent)).json()).toEqual({
      faites: [],
    });
    const id = randomUUID();
    const events = [seance('akhdari:1', id), seance('akhdari:2'), seance('akhdari:2')];
    const r = await req('POST', '/api/v1/attempts', parent, { events });
    expect(r.statusCode).toBe(200);
    expect(r.json().accepted).toHaveLength(3);
    const again = await req('POST', '/api/v1/attempts', parent, { events: [events[0]] });
    expect(again.json().duplicates).toEqual([id]);
    const list = await req('GET', `/api/v1/profiles/${ado}/madjaliss`, parent);
    expect(list.statusCode).toBe(200);
    expect(list.json().faites).toEqual(['akhdari:1', 'akhdari:2']);
  });

  it('refuse un item mal formé, un jour invalide ou des détails trop gros', async () => {
    const r = await req('POST', '/api/v1/attempts', parent, {
      events: [
        seance('akhdari'),
        seance('akhdari:1:2'),
        seance('AKHDARI:1'),
        seance('akhdari:1', randomUUID(), { day: 'hier' }),
        seance('akhdari:1', randomUUID(), { details: { x: 'a'.repeat(3000) } }),
      ],
    });
    expect(r.json().accepted).toHaveLength(0);
    expect(r.json().rejected.length).toBeGreaterThanOrEqual(5);
  });

  it('un autre compte ne lit ni n’écrit les séances du profil', async () => {
    expect((await req('GET', `/api/v1/profiles/${ado}/madjaliss`, other)).statusCode).toBe(404);
    expect((await req('GET', `/api/v1/profiles/${ado}/madjaliss`)).statusCode).toBe(401);
    const r = await req('POST', '/api/v1/attempts', other, { events: [seance('akhdari:3')] });
    expect(r.json().accepted).toHaveLength(0);
    expect(
      (await req('GET', `/api/v1/profiles/${ado}/madjaliss`, parent)).json().faites,
    ).not.toContain('akhdari:3');
  });

  it('le tableau de bord ne compte pas les séances comme des cartes ou des tracés', async () => {
    const d = await req('GET', `/api/v1/dashboard/${ado}?today=${TODAY}`, parent);
    expect(d.statusCode).toBe(200);
    expect(JSON.stringify(d.json())).not.toContain('madjlis');
  });
});
