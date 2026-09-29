import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forbiddenPaths, loadEdition, type Lesson } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;

describe.skipIf(!READY)('API v1', () => {
  let h: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'] }),
      {
        code: 'api-test',
        publish: true,
      },
    );
    app = buildApp({ db: h.db });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('GET /api/v1/health', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'ok', db: true, edition: 'api-test' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /api/v1/levels', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/levels' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { levels: Array<{ code: string; units: number }> };
    expect(body.levels.map((l) => l.code).sort()).toEqual(['ad1', 'en1']);
  });

  it('GET /api/v1/levels/en1/units : toutes les unités dans l’ordre du livre', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/levels/en1/units' });
    expect(r.statusCode).toBe(200);
    const units = (r.json() as { units: Array<{ id: string; n: number; kind: string }> }).units;
    const count = REAL_BOOKS ? 26 : 5; // livre réel en1 : 26 unités ; contenu synthétique : 5
    expect(units).toHaveLength(count);
    expect(units.map((u) => u.n)).toEqual([...Array(count).keys()].map((i) => i + 1));
    expect(units.some((u) => u.kind === 'bilan')).toBe(true);
  });

  it('GET /api/v1/units/:id : projection élève sans guide ni translittération', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/units/en1.l01' });
    expect(r.statusCode).toBe(200);
    const unit = (r.json() as { unit: { lesson: Lesson; exercises: Array<{ id: string }> } }).unit;
    expect(forbiddenPaths(unit.lesson)).toEqual([]);
    expect(unit.exercises[0]?.id).toBe('en1.l01.ex1');
  });

  it.skipIf(!REAL_BOOKS)(
    'GET /api/v1/units/:id : texte coranique intact (livres réels)',
    async () => {
      const r = await app.inject({ method: 'GET', url: '/api/v1/units/en1.l16' });
      expect(r.statusCode).toBe(200);
      const unit = (
        r.json() as { unit: { lesson: Lesson; exercises: Array<{ id: string; hash: string }> } }
      ).unit;
      expect(forbiddenPaths(unit.lesson)).toEqual([]);
      expect(unit.exercises[0]?.id).toBe('en1.l16.ex1');
      const src = loadEdition({
        contentDir: TEST_CONTENT_DIR,
        levels: ['en1'],
        withRegistry: false,
      }).levels[0]?.units.find((u) => u.id === 'en1.l16');
      const expected = src?.content.coran?.versets?.map((v) => v.ar);
      expect(unit.lesson.coran?.versets?.map((v) => v.ar)).toEqual(expected);
    },
  );

  it('404 et 400 normalisés', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/units/en1.l99' })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: '/api/v1/levels/zz9/units' })).statusCode).toBe(
      404,
    );
    const bad = await app.inject({ method: 'GET', url: '/api/v1/units/..%2Fetc' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'requete_invalide' } });
    expect((await app.inject({ method: 'GET', url: '/nimporte' })).statusCode).toBe(404);
  });
});
