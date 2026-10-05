import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

/**
 * A12 — adhkār servis depuis l'édition publiée. Contenu SYNTHÉTIQUE (aucun texte religieux) : on vérifie que
 * la route recopie les champs du livre tels quels, signale ce qui manque, et ne reçoit aucune donnée de position.
 */
describe.skipIf(!url)('A12 — /api/v1/adhkar', () => {
  let c: Ctx;
  beforeAll(async () => {
    const dua = (n: number) => ({
      moment_fr: `Moment d'essai ${n}`,
      moment_ar: '',
      ar: `essai ${n}`,
      fr: `Sens d'essai ${n}`,
      source_fr: `Source ${n}`,
      grade: 'sahih',
      coranique: false,
    });
    c = await setup(url!, [
      {
        id: 're3.l21',
        n: 21,
        content: {},
        student: { rubriques: [{}, {}, { duas: [dua(1), dua(2), dua(3), dua(4)] }] },
      },
      {
        id: 're3.l03',
        n: 3,
        content: {},
        student: { rubriques: [{}, { intro_fr: 'Paragraphe d’essai', duas: [dua(5)] }] },
      },
    ]);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  it('textes recopiés tels quels, ordre par moment, sélections absentes signalées', async () => {
    const r = await c.req('GET', '/api/v1/adhkar');
    expect(r.statusCode).toBe(200);
    const b = r.json() as {
      categories: Array<{
        id: string;
        items: Array<{
          id: string;
          repetitions: number | null;
          dua?: Record<string, unknown>;
          recitation?: Record<string, unknown>;
        }>;
      }>;
      missing: string[];
    };
    const after = b.categories.find((x) => x.id === 'apres_priere')!;
    expect(after.items.map((i) => i.id)).toEqual([
      'istighfar-apres-salam',
      'anta-salam',
      'tasbih-33',
      'tahlil-100',
    ]);
    expect(after.items[0]!.dua).toMatchObject({ ar: 'essai 1', fr: "Sens d'essai 1" });
    expect(after.items[0]!.repetitions).toBe(3);
    expect(after.items[2]!.repetitions).toBe(33);
    const coucher = b.categories.find((x) => x.id === 'coucher')!;
    expect(coucher.items.map((i) => i.id)).toEqual(['ayat-al-kursi', 'bismika-amutu']);
    expect(coucher.items[0]!.recitation).toMatchObject({
      note_fr: 'Paragraphe d’essai',
      refs: [{ s: 2, from: 255, to: 255 }],
      sources: ['al-Bukhārī (2311)'],
    });
    expect(b.missing.some((m) => m.startsWith('reveil'))).toBe(true);
  });

  it('cache public et ETag (304), sans cookie ni identité', async () => {
    const r = await c.req('GET', '/api/v1/adhkar');
    expect(r.headers['cache-control']).toContain('public');
    expect(r.headers['set-cookie']).toBeUndefined();
    const r2 = await c.req('GET', '/api/v1/adhkar', { 'if-none-match': String(r.headers.etag) });
    expect(r2.statusCode).toBe(304);
  });
});
