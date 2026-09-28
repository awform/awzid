import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import {
  connect,
  contentDir,
  DEMO,
  importEdition,
  resetTestDatabase,
  runMigrations,
  seedDemo,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(contentDir(), 'data', 'index-lecons.js'));

describe.skipIf(!READY)('API v1 : illustrations, tentatives, progression', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let prod: FastifyInstance;

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(h.db, loadEdition({ contentDir: contentDir(), levels: ['en1', 'ad1'] }), {
      code: 'api-att',
      publish: true,
    });
    await seedDemo(h.db);
    app = buildApp({ db: h.db, devAttempts: true });
    prod = buildApp({ db: h.db });
    await app.ready();
    await prod.ready();
  });
  afterAll(async () => {
    await app?.close();
    await prod?.close();
    await h?.close();
  });

  it('la leçon arrive avec ses illustrations (SVG validé, personnages sans visage)', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/units/en1.l01' });
    const body = r.json() as { illustrations: Record<string, { viewBox: string; svg: string }> };
    expect(Object.keys(body.illustrations).length).toBeGreaterThan(5);
    expect(body.illustrations.youssouf?.viewBox).toBe('0 0 100 130');
    for (const ill of Object.values(body.illustrations))
      expect(ill.svg).not.toMatch(/<script|<text|href=/);
  });

  it('routes de tentatives absentes hors développement', async () => {
    expect(
      (await prod.inject({ method: 'POST', url: '/api/v1/attempts', payload: { events: [] } }))
        .statusCode,
    ).toBe(404);
    expect((await prod.inject({ method: 'GET', url: '/api/v1/dev/profiles' })).statusCode).toBe(
      404,
    );
  });

  it('enregistre une réponse (corrigée par le serveur) et renvoie la progression', async () => {
    const unit = (await app.inject({ method: 'GET', url: '/api/v1/units/en1.l02' })).json() as {
      unit: {
        lesson: { exercices: Array<{ type: string; items?: Array<{ reponse?: string }> }> };
        exercises: Array<{ id: string; hash: string; type: string }>;
      };
    };
    const k = unit.unit.exercises.findIndex((e) => e.type === 'premiere_lettre');
    const e = unit.unit.exercises[k]!;
    const reponse = unit.unit.lesson.exercices[k]!.items![0]!.reponse!;
    const ev = {
      id: randomUUID(),
      profileId: DEMO.enfant,
      unitId: 'en1.l02',
      eventType: 'reponse',
      exerciseId: e.id,
      exerciseHash: e.hash,
      itemIndex: 0,
      response: { choice: reponse },
      deviceAt: new Date().toISOString(),
    };
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/attempts',
      payload: { events: [ev, { ...ev, id: randomUUID(), profileId: randomUUID() }] },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      accepted: Array<{ correct: boolean }>;
      rejected: Array<{ reason: string }>;
      progress: Record<string, { status: string }>;
    };
    expect(body.accepted).toEqual([{ id: ev.id, correct: true }]);
    expect(body.rejected).toEqual([{ id: expect.any(String), reason: 'profil non autorisé' }]);
    expect(body.progress['en1.l02']?.status).toBe('commencee');
    const p = await app.inject({
      method: 'GET',
      url: `/api/v1/progress?profile=${DEMO.enfant}&level=en1`,
    });
    expect((p.json() as { progress: Array<{ unitId: string; status: string }> }).progress).toEqual([
      expect.objectContaining({ unitId: 'en1.l02', status: 'commencee' }),
    ]);
  });

  it('refuse un corps invalide', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/attempts', payload: { rien: 1 } });
    expect(r.statusCode).toBe(400);
  });
});
