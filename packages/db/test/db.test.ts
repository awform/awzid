/**
 * Intégration PostgreSQL (base awform_test) : migrations, import idempotent d'en1 + ad1,
 * aller-retour octet par octet du texte coranique (fichiers → base → lecture).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { forbiddenPaths, loadEdition, type EditionLoad, type Lesson } from '@awform/content';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '../src/client.js';
import { contentDir } from '../src/env.js';
import { importEdition, ImportRefusedError } from '../src/import.js';
import { currentEdition, getUnitForStudent, listLevels, listUnits } from '../src/queries.js';
import * as t from '../src/schema.js';

const URL = process.env.TEST_DATABASE_URL;
const DIR = contentDir();
const READY = !!URL && existsSync(join(DIR, 'data', 'index-lecons.js'));

describe.skipIf(!READY)('base de données (awform_test)', () => {
  let h: DbHandle;
  let load: EditionLoad;

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    load = loadEdition({ contentDir: DIR, levels: ['en1', 'ad1'] });
  });
  afterAll(async () => {
    await h?.close();
  });

  it('les migrations créent le schéma initial', async () => {
    const r = await h.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' order by 1",
    );
    const names = r.rows.map((x) => x.table_name);
    for (const n of [
      'edition',
      'level',
      'unit',
      'unit_version',
      'exercise',
      'exercise_version',
      'account',
      'profile',
      'guardianship',
      'attempt',
      'progress',
      'quran_verse',
      'registry_entry',
      'audit_log',
    ])
      expect(names).toContain(n);
  });

  it('importe en1 + ad1 et publie l’édition', async () => {
    const r = await importEdition(h.db, load, { code: 'test.1', publish: true });
    expect(r).toMatchObject({ status: 'cree', units: 51, exercises: 257 });
    const ed = await currentEdition(h.db);
    expect(ed?.code).toBe('test.1');
    const levels = await listLevels(h.db, ed!.id);
    expect(levels.map((l) => [l.code, l.units])).toEqual([
      ['ad1', 25],
      ['en1', 26],
    ]);
    const units = await listUnits(h.db, ed!.id, 'en1');
    expect(units).toHaveLength(26);
    expect(units[0]?.id).toBe('en1.l01');
  });

  it('réimporter la même source ne change rien (idempotence)', async () => {
    const count = async () =>
      (
        await h.pool.query<{ n: number }>(
          'select (select count(*) from unit_version)::int + (select count(*) from exercise_version)::int + (select count(*) from registry_entry)::int as n',
        )
      ).rows[0]?.n;
    const before = await count();
    const r = await importEdition(h.db, load, { code: 'test.1', publish: true });
    expect(r.status).toBe('inchange');
    expect(await count()).toBe(before);
  });

  it('refuse une autre source sous le même code d’édition publiée', async () => {
    const other = { ...load, sourceSha256: 'autre' };
    await expect(
      importEdition(h.db, other, { code: 'test.1', replace: true }),
    ).rejects.toBeInstanceOf(ImportRefusedError);
  });

  it('aller-retour octet par octet : versets des leçons et Coran de référence', async () => {
    const ed = await currentEdition(h.db);
    let compared = 0;
    for (const lv of load.levels)
      for (const u of lv.units) {
        const [row] = await h.db
          .select({ content: t.unitVersion.content, student: t.unitVersion.student })
          .from(t.unitVersion)
          .where(sql`${t.unitVersion.editionId} = ${ed!.id} and ${t.unitVersion.unitId} = ${u.id}`);
        const src = u.content.coran?.versets ?? [];
        const fromDb = (row?.content as Lesson).coran?.versets ?? [];
        const fromStudent = (row?.student as Lesson).coran?.versets ?? [];
        expect(fromDb.length).toBe(src.length);
        src.forEach((v, i) => {
          expect(fromDb[i]?.ar === v.ar).toBe(true);
          expect(fromStudent[i]?.ar === v.ar).toBe(true);
          compared++;
        });
      }
    expect(compared).toBeGreaterThan(100);
    const stored = await h.db.select().from(t.quranVerse);
    expect(stored).toHaveLength(6236);
    expect(stored.every((r) => load.tanzil.get(`${r.sura}:${r.aya}`) === r.text)).toBe(true);
  });

  it('la leçon servie à l’élève ne contient ni guide ni translittération', async () => {
    const ed = await currentEdition(h.db);
    const u = await getUnitForStudent(h.db, ed!.id, 'ad1.l10');
    expect(u?.exercises.length).toBeGreaterThan(0);
    expect(forbiddenPaths(u?.lesson)).toEqual([]);
    const [full] = await h.db
      .select({ c: t.unitVersion.content })
      .from(t.unitVersion)
      .where(eq(t.unitVersion.unitId, 'ad1.l10'));
    expect(forbiddenPaths(full?.c).length).toBeGreaterThan(0);
  });

  it('registre importé sans validation humaine inventée ; URL courtes des QR', async () => {
    const r = await h.pool.query<{ n: number; vh: number }>(
      'select count(*)::int as n, count(*) filter (where validation_humaine)::int as vh from registry_entry',
    );
    expect(r.rows[0]?.n).toBeGreaterThan(1000);
    const reg = load.registry!;
    const sourceTrue = [reg.coran, reg.hadiths, reg.fiqh]
      .flatMap((m) => Object.values(m))
      .filter((e) => e.validation_humaine === true).length;
    expect(r.rows[0]?.vh).toBe(sourceTrue);
    const qr = await h.db.select().from(t.qrRedirect).where(eq(t.qrRedirect.slug, 'en1-05'));
    expect(qr[0]?.unitId).toBe('en1.l05');
  });
});
