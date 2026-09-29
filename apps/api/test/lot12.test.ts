/** Lot 12 — métadonnées officielles Tanzil : divisions importées, pages RÉELLES du Muṣḥaf de Médine. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(TEST_CONTENT_DIR, 'coran', 'tanzil-quran-data.js'));

describe.skipIf(!READY)('lot 12 — métadonnées Tanzil (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    const load = loadEdition({
      contentDir: TEST_CONTENT_DIR,
      levels: ['en1'],
      withRegistry: false,
    });
    expect(load.quranData?.pages).toHaveLength(604);
    await importEdition(h.db, load, { code: 'l12', publish: true });
    // réimport : les divisions ne changent pas
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1'], withRegistry: false }),
      {
        code: 'l12b',
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

  it('méta du Coran : 30 ajzāʾ, 240 quarts, 604 pages RÉELLES', async () => {
    const m = (await app.inject({ method: 'GET', url: '/api/v1/quran/meta' })).json();
    expect(m.realPages).toBe(true);
    expect(m.divisions.juz).toHaveLength(30);
    expect(m.divisions.quarters).toHaveLength(240);
    expect(m.divisions.pages).toHaveLength(604);
    expect(m.totalWeight).toBeCloseTo(604, 6);
    // page 1 du Muṣḥaf de Médine = Al-Fātiḥa (7 versets) : exactement une page
    const fatiha = (m.weights[0] as number[]).reduce((a, b) => a + b, 0);
    expect(fatiha).toBeCloseTo(1, 9);
    // sourate 2, page 2 : 2:1 à 2:5
    const p2 = (m.weights[1] as number[]).slice(0, 5).reduce((a, b) => a + b, 0);
    expect(p2).toBeCloseTo(1, 9);
  });
});
