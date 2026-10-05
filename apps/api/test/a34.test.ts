import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMushafExact } from '../src/mushaf-exact.js';

/**
 * A34 — service du Muṣḥaf « à l'identique » : lignes synchronisées (connecté seulement, une page à la fois),
 * état et retard de synchronisation, polices du Complexe octet pour octet. Fichiers SYNTHÉTIQUES de test.
 */
const root = mkdtempSync(join(tmpdir(), 'a34-api-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const data = join(root, 'qf');
const fonts = join(root, 'qcf');
mkdirSync(join(data, 'publie', 'pages'), { recursive: true });
mkdirSync(fonts, { recursive: true });
const synced = '2026-10-06T00:00:00.000Z';
writeFileSync(
  join(data, 'publie', 'manifeste.json'),
  JSON.stringify({
    format: 1,
    sha256: 'a'.repeat(64),
    version: 'aaaaaaaaaaaaaaaa',
    generatedAt: synced,
    pages: 604,
    source: { syncedAt: synced },
    credit:
      'Données de mise en page : Quran Foundation (Content Sync) — polices : Complexe du Roi Fahd',
    terms: 'https://api-docs.quran.foundation/legal/developer-terms/',
  }),
);
const page = { format: 1, p: 3, lines: [{ n: 1, w: [[2, 6, 1, 'x', 'word']] }] };
writeFileSync(join(data, 'publie', 'pages', '003.json'), JSON.stringify(page));
const ttf = Buffer.from([0, 1, 0, 0, 9, 8, 7]);
writeFileSync(join(fonts, 'QCF_P003.ttf'), ttf);
writeFileSync(join(fonts, 'SHA256SUMS'), `${'b'.repeat(64)}  QCF_P003.ttf\n`);

let clock = Date.parse(synced) + 3600_000;
const app = Fastify();
app.addHook('onRequest', async (req) => {
  if (req.headers['x-test-connecte'])
    Object.assign(req, { auth: { accountId: 'x', kind: 'famille' } });
});
registerMushafExact(app, data, fonts, () => clock);
const none = Fastify();
registerMushafExact(none, null, null);

describe('A34 — API du Muṣḥaf « à l’identique »', () => {
  it('état : disponible, version, crédit ; retard au-delà de 7 jours', async () => {
    const r = (await app.inject('/api/v1/quran/mushaf-exact')).json();
    expect(r).toMatchObject({ disponible: true, version: 'aaaaaaaaaaaaaaaa', enRetard: false });
    expect(r.credit).toMatch(/Quran Foundation/);
    clock = Date.parse(synced) + 8 * 24 * 3600_000;
    expect((await app.inject('/api/v1/quran/mushaf-exact')).json().enRetard).toBe(true);
    expect((await none.inject('/api/v1/quran/mushaf-exact')).json()).toEqual({
      disponible: false,
      polices: false,
    });
  });

  it('page de lignes : connecté seulement, ETag, 304, 404 si absente ou non synchronisée', async () => {
    expect((await app.inject('/api/v1/quran/mushaf-exact/pages/3')).statusCode).toBe(401);
    const h = { 'x-test-connecte': '1' };
    const r = await app.inject({ url: '/api/v1/quran/mushaf-exact/pages/3', headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(page);
    const etag = r.headers.etag as string;
    const r2 = await app.inject({
      url: '/api/v1/quran/mushaf-exact/pages/3',
      headers: { ...h, 'if-none-match': etag },
    });
    expect(r2.statusCode).toBe(304);
    expect(
      (await app.inject({ url: '/api/v1/quran/mushaf-exact/pages/4', headers: h })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: '/api/v1/quran/mushaf-exact/pages/605', headers: h })).statusCode,
    ).toBe(400);
    expect(
      (await none.inject({ url: '/api/v1/quran/mushaf-exact/pages/3', headers: h })).statusCode,
    ).toBe(401);
  });

  it('police : octet pour octet, font/ttf, ETag de SHA256SUMS ; noms hors liste refusés', async () => {
    const r = await app.inject('/api/v1/quran/mushaf-exact/polices/QCF_P003.ttf');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('font/ttf');
    expect(Buffer.compare(r.rawPayload, ttf)).toBe(0);
    expect(r.headers.etag).toBe(`"${'b'.repeat(32)}"`);
    expect((await app.inject('/api/v1/quran/mushaf-exact/polices/QCF_P004.ttf')).statusCode).toBe(
      404,
    );
    expect((await app.inject('/api/v1/quran/mushaf-exact/polices/..%2Fx.ttf')).statusCode).toBe(
      400,
    );
    expect((await none.inject('/api/v1/quran/mushaf-exact/polices/QCF_P003.ttf')).statusCode).toBe(
      404,
    );
  });
});
