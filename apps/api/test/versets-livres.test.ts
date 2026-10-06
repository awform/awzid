/**
 * Versets dans les leçons, sur les VRAIS livres (si présents) : ad1 leçon 1, « L'intention » — le verset
 * al-Bayyina 98:5 est repéré par correspondance EXACTE avec le texte Tanzil (sous-chaîne octet pour octet du
 * verset), le hadith et la phrase ordinaire ne le sont pas ; le texte du livre n'est pas modifié.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VERSE_FIELD } from '@awform/content/versets';
import { setupEdition, type Ctx } from './helpers.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
type Point = {
  ar: string;
  fr: string;
  [VERSE_FIELD]?: { i: number; j: number; s?: number; a?: number };
};

describe.skipIf(!URL || !REAL_BOOKS)('versets dans les leçons — vrais livres (ad1 l01)', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL!, {}, TEST_CONTENT_DIR, ['ad1']);
  }, 240_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('« L’intention » : 98:5 repéré (Tanzil exact), hadith et phrase non', async () => {
    const r = await c.req('GET', '/api/v1/units/ad1.l01');
    expect(r.statusCode, r.body).toBe(200);
    const points = r.json().unit.lesson.fiqh_adab.points as Point[];
    const v = points.filter((p) => p[VERSE_FIELD]);
    expect(v).toHaveLength(1);
    const m = v[0]![VERSE_FIELD]!;
    expect(m).toMatchObject({ s: 98, a: 5, ref: 'Al-Bayyina 98:5, extrait' });
    const exact = v[0]!.ar.slice(m.i, m.j);
    const tz = readFileSync(join(TEST_CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv'), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('98:5\t'))!
      .split('\t')[1]!;
    expect(tz.includes(exact)).toBe(true);
    expect(exact.split(' ').length).toBeGreaterThanOrEqual(3);
    // le hadith « إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ » et les phrases ordinaires ne sont pas des versets
    expect(points[0]![VERSE_FIELD]).toBeUndefined();
    expect(points.filter((p) => !p[VERSE_FIELD]).length).toBe(points.length - 1);
  });
});
