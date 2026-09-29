/** Lot 15 — drapeau des langues en préparation (jamais en production par défaut) et activité « racines ». */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import {
  connect,
  contentDir,
  importEdition,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(contentDir(), 'data', 'ad2', 'l12.js'));

describe.skipIf(!READY)('lot 15 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: contentDir(), levels: ['ad2'], withRegistry: false }),
      { code: 'l15', publish: true },
    );
    app = buildApp({ db: h.db });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('langues en préparation : masquées par défaut (production), montrables seulement avec le drapeau', async () => {
    const before = process.env.AWFORM_LANGUES_PREPARATION;
    delete process.env.AWFORM_LANGUES_PREPARATION;
    expect((await app.inject({ url: '/api/v1/config' })).json()).toEqual({
      languesEnPreparation: false,
    });
    process.env.AWFORM_LANGUES_PREPARATION = 'on';
    expect((await app.inject({ url: '/api/v1/config' })).json().languesEnPreparation).toBe(true);
    if (before === undefined) delete process.env.AWFORM_LANGUES_PREPARATION;
    else process.env.AWFORM_LANGUES_PREPARATION = before;
  });

  it('racines : les quatre éléments du livre Adultes N2 (leçon 12), vérifiés à l’import', async () => {
    const r = (await app.inject({ url: '/api/v1/activites/racines' })).json();
    expect(r.items.map((x: { id: string }) => x.id)).toEqual([
      'ktb-fuul',
      'ktb-mafail',
      'byt-fuul',
      'qlm-afal',
    ]);
    expect(r.items[0]).toMatchObject({ root: 'ك ت ب', source: 'ad2.l12' });
  });
});
