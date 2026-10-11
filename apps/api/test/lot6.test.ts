/**
 * Lot 6 — tracé et cartes (journal d'entraînement), tableau de bord parent / adulte, page publique du QR.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerPaths, forbiddenPaths, loadEdition } from '@awform/content';
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
const TODAY = new Date().toISOString().slice(0, 10);

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

describe.skipIf(!READY)('lot 6 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let adult = '';
  let other = '';
  let profile = '';

  const req = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'lot6', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    const signup = async (email: string) =>
      req('POST', '/api/v1/auth/signup', '', {
        kind: 'adulte',
        email,
        password: PW,
        country: 'FR',
        birthYear: 1990,
        consents: ['cgu', 'donnee_religieuse_art9'],
      });
    const a = await signup('adulte.lot6@exemple.org');
    adult = cookieOf(a);
    profile = a.json().profiles[0].id;
    other = cookieOf(await signup('autre.lot6@exemple.org'));
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  const ev = (eventType: string, response: object) => ({
    id: randomUUID(),
    profileId: profile,
    unitId: 'entrainement',
    eventType,
    response,
    deviceAt: new Date().toISOString(),
  });

  it('entraînement par la file hors ligne : tracés et cartes, idempotent, validé', async () => {
    const t1 = ev('trace', { item: 'ب:isolee', ok: true, day: TODAY, details: { etape: 1 } });
    const t2 = ev('trace', {
      item: 'ب:isolee',
      ok: false,
      day: TODAY,
      details: { motif: 'droite' },
    });
    const c1 = ev('carte', { item: 'بَابٌ', ok: true, day: TODAY, details: { boite: 2 } });
    const bad = ev('carte', { item: '', ok: 'oui', day: TODAY });
    const r = (await req('POST', '/api/v1/attempts', adult, { events: [t1, t2, c1, bad] })).json();
    expect(r.accepted).toHaveLength(3);
    expect(r.rejected.map((x: { id: string }) => x.id)).toEqual([bad.id]);
    expect(
      (await req('POST', '/api/v1/attempts', adult, { events: [t1] })).json().duplicates,
    ).toEqual([t1.id]);
    const stolen = (
      await req('POST', '/api/v1/attempts', other, {
        events: [ev('trace', { item: 'ت:isolee', ok: true, day: TODAY })],
      })
    ).json();
    expect(stolen.rejected[0].reason).toBe('profil non autorisé');
  });

  it('tableau de bord : progression par niveau, activité des 14 jours, totaux ; réservé au titulaire', async () => {
    expect((await req('GET', `/api/v1/dashboard/${profile}`)).statusCode).toBe(401);
    expect((await req('GET', `/api/v1/dashboard/${profile}`, other)).statusCode).toBe(404);
    const d = (await req('GET', `/api/v1/dashboard/${profile}?today=${TODAY}`, adult)).json();
    expect(d.activity).toHaveLength(14);
    const last = d.activity[13];
    expect(last.day).toBe(TODAY);
    expect(last).toMatchObject({ traces: 2, cartes: 1 });
    expect(d.traces).toEqual({ total: 2, reussis: 1 });
    expect(d.cartes).toEqual({ total: 1, sus: 1 });
    expect(d.levels).toEqual({});
  });

  it('page publique du QR : titre, objectifs, mots et images — jamais d’exercice ni de corrigé', async () => {
    const r = await req('GET', '/api/v1/public/l/en1-05');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toContain('public');
    const p = r.json();
    expect(p.unitId).toBe('en1.l05');
    expect(p.lesson.mots.length).toBeGreaterThan(0);
    expect(p.lesson.exercices).toBeUndefined();
    expect(forbiddenPaths(p.lesson)).toEqual([]);
    expect(answerPaths(p.lesson)).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/"(tr|guide|reponse|corrige)"\s*:/);
    for (const m of p.lesson.mots) if (m.img) expect(p.illustrations[m.img]).toBeDefined();
    expect((await req('GET', '/api/v1/public/l/en1-99')).statusCode).toBe(404);
    expect((await req('GET', '/api/v1/public/l/..%2Fx')).statusCode).toBe(400);
  });

  it('export RGPD : journal d’entraînement inclus', async () => {
    const e = (await req('GET', '/api/v1/account/export', adult)).json();
    expect(e.entrainement).toHaveLength(3);
  });

  it('mise en service : cookie « Secure » selon HTTPS derrière le proxy (COOKIE_SECURE=auto)', async () => {
    process.env.TRUST_PROXY = '1';
    const auto = buildApp({ db: h.db, secretKey: randomBytes(32), cookieSecure: 'auto' });
    await auto.ready();
    const signup = (email: string, proto: string) =>
      auto.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        headers: { 'x-awform': '1', 'x-forwarded-proto': proto },
        payload: {
          kind: 'parent',
          birthYear: 1985,
          email,
          password: PW,
          country: 'FR',
          consents: ['cgu', 'donnee_religieuse_art9'],
        },
      });
    expect(String((await signup('https.lot7@exemple.org', 'https')).headers['set-cookie'])).toMatch(
      /; Secure/,
    );
    expect(
      String((await signup('http.lot7@exemple.org', 'http')).headers['set-cookie']),
    ).not.toMatch(/Secure/);
    await auto.close();
    delete process.env.TRUST_PROXY;
  });
});
