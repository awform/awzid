/** Lot 11 — séance du jour, régularité (ados/adultes seulement), rapport hebdomadaire, protections. */
import { randomBytes } from 'node:crypto';
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
import { isoWeekday, mondayOf } from '../src/today.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

it('semaine du lundi au dimanche', () => {
  expect(isoWeekday('2026-09-28')).toBe(1);
  expect(isoWeekday('2026-10-04')).toBe(7);
  expect(mondayOf('2026-10-04')).toBe('2026-09-28');
  expect(mondayOf('2026-09-28')).toBe('2026-09-28');
});

describe.skipIf(!READY)('lot 11 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let parent = '';
  let child = '';
  let teen = '';
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1'], withRegistry: false }),
      { code: 'l11', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    parent = cookieOf(
      await req('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        email: 'p11@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
      }),
    );
    const mk = async (pseudonym: string, age: number) =>
      (
        await req('POST', '/api/v1/profiles', parent, {
          pseudonym,
          birthYear: YEAR - age,
          levelCode: 'en1',
          password: PW,
          consents: ['compte_suivi'],
        })
      ).json().id as string;
    child = await mk('Nour', 8);
    teen = await mk('Idris', 15);
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('séance du jour : leçon en cours ; enfant sans compteur ; ado avec régularité', async () => {
    const c = (await req('GET', `/api/v1/today/${child}?today=2026-09-30`, parent)).json();
    expect(c.lecon.id).toBe('en1.l01');
    expect(c.regularite).toBeNull();
    const t = (await req('GET', `/api/v1/today/${teen}?today=2026-09-30`, parent)).json();
    expect(t.regularite).toMatchObject({ objectif: 4, repos: [], joursActifs: 0 });
    expect(t.regularite.semaine).toHaveLength(7);
    expect(t.regularite.semaine[0].day).toBe('2026-09-28');
  });

  it('régularité : réglable pour l’ado, refusée pour l’enfant, bornée', async () => {
    expect(
      (
        await req('PUT', `/api/v1/profiles/${child}/regularite`, parent, { objectif: 4, repos: [] })
      ).json().error.code,
    ).toBe('pas_pour_les_enfants');
    expect(
      (await req('PUT', `/api/v1/profiles/${teen}/regularite`, parent, { objectif: 7, repos: [] }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await req('PUT', `/api/v1/profiles/${teen}/regularite`, parent, {
          objectif: 6,
          repos: [5, 6],
        })
      ).json().error.code,
    ).toBe('objectif_trop_haut');
    expect(
      (
        await req('PUT', `/api/v1/profiles/${teen}/regularite`, parent, {
          objectif: 5,
          repos: [7, 5],
        })
      ).json(),
    ).toEqual({ objectif: 5, repos: [5, 7] });
    const t = (await req('GET', `/api/v1/today/${teen}?today=2026-10-02`, parent)).json();
    expect(
      t.regularite.semaine
        .filter((d: { repos: boolean }) => d.repos)
        .map((d: { weekday: number }) => d.weekday),
    ).toEqual([5, 7]);
  });

  it('rapport hebdomadaire et protections ; accès réservé au titulaire', async () => {
    const r = (
      await req('GET', `/api/v1/rapport-hebdo/${child}?dimanche=2026-10-04`, parent)
    ).json();
    expect(r.semaine).toEqual({ lundi: '2026-09-28', dimanche: '2026-10-04' });
    expect(r.joursActifs).toBeNull();
    const p = (await req('GET', `/api/v1/profiles/${child}/protections`, parent)).json();
    expect(p).toMatchObject({
      mineur: true,
      enfant: true,
      tuteurIA: false,
      texteLibreTuteur: false,
      publicite: false,
      monnaieVirtuelle: false,
      enregistrementsEnvoyes: false,
      compteurRegularite: false,
    });
    const other = cookieOf(
      await req('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        email: 'autre11@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
      }),
    );
    expect((await req('GET', `/api/v1/today/${child}`, other)).statusCode).toBe(404);
    expect((await req('GET', `/api/v1/rapport-hebdo/${child}`, other)).statusCode).toBe(404);
  });
});
