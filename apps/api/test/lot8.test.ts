/**
 * Lot 8 — livres gelés supplémentaires (religion), aperçu des livres non gelés, bibliothèque des livrets,
 * numéros de hadiths visibles seulement s'ils sont VERIFIE au registre.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { forbiddenPaths, loadEdition } from '@awform/content';
import {
  connect,
  contentDir,
  importEdition,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const URL = process.env.TEST_DATABASE_URL;
const READY =
  !!URL &&
  existsSync(join(contentDir(), 'data', 're1', 'l01.js')) &&
  existsSync(join(contentDir(), 'data', 'lect', 'catalogue.js'));

describe.skipIf(!READY)('lot 8 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let editionId = '';
  const get = (url: string) => app.inject({ method: 'GET', url });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    const load = loadEdition({ contentDir: contentDir(), levels: ['en1', 're1', 'ra1'] });
    for (const lv of load.levels) if (lv.code === 'ra1') lv.book = { ...lv.book, apercu: true };
    editionId = (await importEdition(h.db, load, { code: 'lot8', publish: true })).editionId;
    app = buildApp({ db: h.db });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('niveaux : religion importée, livre non gelé marqué « aperçu »', async () => {
    const levels = (await get('/api/v1/levels')).json().levels as Array<{
      code: string;
      track: string;
      apercu: boolean;
    }>;
    expect(levels.find((l) => l.code === 're1')).toMatchObject({
      track: 'religion',
      apercu: false,
    });
    expect(levels.find((l) => l.code === 'ra1')).toMatchObject({
      track: 'religion-ra',
      apercu: true,
    });
  });

  it('leçon de religion en projection élève : rubriques, sans guide ni sources', async () => {
    const u = (await get('/api/v1/units/re1.l01')).json().unit;
    expect(u.lesson.rubriques.length).toBeGreaterThan(0);
    expect(forbiddenPaths(u.lesson)).toEqual([]);
    expect(u.exercises[0].id).toBe('re1.l01.ex1');
    const ra = (await get('/api/v1/units/ra1.l01')).json().unit;
    expect(ra.lesson.vh).toBeUndefined();
  });

  it('numéros de hadiths : seuls ceux VERIFIE au registre restent visibles', async () => {
    const [ed] = await h.db.select().from(t.edition).where(eq(t.edition.id, editionId));
    const masked = (ed!.report as { numerosHadithsMasques?: number }).numerosHadithsMasques;
    expect(typeof masked).toBe('number');
    // aucun numéro de Muslim/al-Bukhārī non vérifié ne subsiste dans les projections élève
    const reg = await h.db.select().from(t.registryEntry).where(eq(t.registryEntry.kind, 'hadith'));
    const ok = new Set(
      reg
        .filter((r) => r.statut === 'VERIFIE')
        .map(
          (r) =>
            `${String((r.data as { recueil?: string }).recueil)}#${String((r.data as { numero?: number }).numero)}`,
        ),
    );
    const units = await h.db
      .select({ s: t.unitVersion.student })
      .from(t.unitVersion)
      .where(eq(t.unitVersion.editionId, editionId));
    const text = JSON.stringify(units.map((u) => u.s));
    for (const m of text.matchAll(/(al-Bukhārī|Muslim) \((\d{1,5})/g))
      expect(ok.has(`${m[1]}#${m[2]}`), m[0]).toBe(true);
  });

  it('bibliothèque : catalogue ordonné, livret sans guide, translittération ni contrôles', async () => {
    const list = (await get('/api/v1/booklets')).json().booklets as Array<{
      code: string;
      level: string;
      titreFr: string;
    }>;
    expect(list.length).toBeGreaterThan(90);
    expect(list[0]!.code).toBe('en1-01');
    const b = (await get('/api/v1/booklets/en1-01')).json();
    expect(b.booklet.pages.length).toBeGreaterThan(3);
    expect(b.booklet.guide).toBeUndefined();
    expect(b.booklet.controle).toBeUndefined();
    expect(JSON.stringify(b.booklet)).not.toMatch(/"tr":/);
    expect(Object.keys(b.illustrations).length).toBeGreaterThan(0);
    // décor des scènes (marché : étal, palmier) livré avec le livret, sinon cadres « manquant »
    const m = (await get('/api/v1/booklets/ad1-01')).json();
    expect(Object.keys(m.illustrations)).toEqual(expect.arrayContaining(['stall', 'palm']));
    expect((await get('/api/v1/booklets/en1-99')).statusCode).toBe(404);
  });
});
