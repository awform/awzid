import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forbiddenPaths, loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { clearPackCache } from '../src/packs.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;

/** Budget de données (ARCHITECTURE_V2 §3.3) : une leçon ≤ 40 Ko compressée, un niveau ≤ 1 Mo. */
const BUDGET_LECON = 40 * 1024;
const BUDGET_NIVEAU = 1024 * 1024;

describe.skipIf(!READY)('paquets de niveau (hors ligne)', () => {
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
        code: 'packs',
        publish: true,
      },
    );
    clearPackCache();
    app = buildApp({ db: h.db });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('manifeste : un paquet par niveau, empreintes des leçons, poids compressé, budget respecté', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/packs' });
    expect(r.statusCode).toBe(200);
    const m = r.json() as {
      packs: Array<{
        level: string;
        hash: string;
        bytes: number;
        rawBytes: number;
        illustrations: number;
        units: Array<{ id: string; sha256: string; brotliBytes: number }>;
      }>;
    };
    expect(m.packs.map((p) => p.level).sort()).toEqual(['ad1', 'en1']);
    const lines = [
      '# Budget de données mesuré (paquets de niveau, Brotli qualité 11)',
      '',
      '| Niveau | Leçons | Illustrations | Brut | Compressé | Leçon moyenne | Leçon max |',
      '|---|---|---|---|---|---|---|',
    ];
    for (const p of m.packs) {
      // vrais livres : plus de 20 unités par niveau ; contenu synthétique : quelques unités
      expect(p.units.length).toBeGreaterThan(REAL_BOOKS ? 20 : 2);
      expect(p.bytes).toBeLessThan(BUDGET_NIVEAU);
      const max = Math.max(...p.units.map((u) => u.brotliBytes));
      const avg = p.units.reduce((s, u) => s + u.brotliBytes, 0) / p.units.length;
      expect(max).toBeLessThan(BUDGET_LECON);
      const ko = (n: number) => `${(n / 1024).toFixed(1)} Ko`;
      lines.push(
        `| ${p.level} | ${p.units.length} | ${p.illustrations} | ${ko(p.rawBytes)} | ${ko(p.bytes)} | ${ko(avg)} | ${ko(max)} |`,
      );
    }
    mkdirSync(new globalThis.URL('../../../reports/', import.meta.url), { recursive: true });
    writeFileSync(
      new globalThis.URL('../../../reports/budget-donnees.md', import.meta.url),
      lines.join('\n') + '\n',
    );
  });

  it('paquet complet : projection élève seulement, mêmes leçons que /units/:id, illustrations incluses', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/packs/en1' });
    expect(r.statusCode).toBe(200);
    const p = r.json() as {
      hash: string;
      units: Array<{ id: string; lesson: unknown; exercises: unknown[] }>;
      illustrations: Record<string, { svg: string }>;
    };
    expect(p.units).toHaveLength(REAL_BOOKS ? 26 : 5);
    for (const u of p.units) expect(forbiddenPaths(u.lesson), u.id).toEqual([]);
    const one = (await app.inject({ method: 'GET', url: '/api/v1/units/en1.l05' })).json() as {
      unit: unknown;
      illustrations: Record<string, unknown>;
    };
    expect(p.units.find((u) => u.id === 'en1.l05')).toEqual(one.unit);
    for (const k of Object.keys(one.illustrations)) expect(p.illustrations[k], k).toBeDefined();
    if (REAL_BOOKS) expect(p.illustrations.youssouf).toBeDefined();
  });

  it('ETag : 304 quand l’appareil a déjà le paquet ; compression Brotli', async () => {
    const r1 = await app.inject({
      method: 'GET',
      url: '/api/v1/packs/ad1',
      headers: { 'accept-encoding': 'br' },
    });
    expect(r1.headers['content-encoding']).toBe('br');
    const etag = String(r1.headers.etag);
    const r2 = await app.inject({
      method: 'GET',
      url: '/api/v1/packs/ad1',
      headers: { 'if-none-match': etag },
    });
    expect(r2.statusCode).toBe(304);
  });
});
