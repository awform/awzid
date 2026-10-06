import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t } from '@awform/db';
import { child, parent, setup, type Ctx } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

/**
 * A37 — « Vivre l'islam », bon comportement : catalogue public des rubriques (rangées par cercle et par lieu) et
 * des fiches ; leçons atteintes d'un élève. Contenu SYNTHÉTIQUE (aucun texte religieux).
 */
describe.skipIf(!url)('A37 — /api/v1/vivre', () => {
  let c: Ctx;
  const bloc = (titre_fr: string, fr: string) => ({
    titre_ar: 'تَجْرِبَةٌ',
    titre_fr,
    points: [{ ar: 'نَصٌّ', fr }],
  });
  const fiche = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    titre_fr: `Fiche ${id}`,
    cercles: ['amis'],
    lieux: ['ecole'],
    ages: ['enfant'],
    situation_fr: 'Situation synthétique.',
    etapes: { avant: [], pendant: [{ fr: 'Point synthétique.', statut: 'recommande' }], apres: [] },
    defi_fr: 'Défi synthétique.',
    ...extra,
  });
  beforeAll(async () => {
    c = await setup(url!, [
      {
        id: 'en1.l01',
        n: 1,
        student: { fiqh_adab: bloc('Essai : avec mes parents', 'Je range ma chambre.') },
      },
      {
        id: 'en1.l02',
        n: 2,
        student: { fiqh_adab: bloc('Essai : mon voisin', 'Je dis bonjour à mon voisin.') },
      },
      {
        id: 'en1.l03',
        n: 3,
        student: { fiqh_adab: bloc('Essai : à table', 'Je mange au repas.') },
      },
      {
        id: 'en1.l04',
        n: 4,
        student: {
          rubriques: [
            { code: 'aqida', titre_fr: 'Ignorée' },
            {
              code: 'adab',
              titre_fr: 'Essai : les animaux',
              intro_fr: 'Un chat.',
              situations: [{}, {}],
            },
          ],
        },
      },
    ]);
    await c.h.db
      .insert(t.levelVersion)
      .values({ editionId: c.editionId, levelCode: 'en1', book: {} });
    await c.h.db.insert(t.evalDoc).values([
      {
        editionId: c.editionId,
        key: 'akhlaq.fiches',
        content: {
          fiches: [
            fiche('ok.01'),
            fiche('ok.02', { ages: ['adulte'] }),
            { id: 'mauvaise' },
            fiche('essai.99', { test: true }),
          ],
        },
      },
      {
        editionId: c.editionId,
        key: 'akhlaq.index',
        content: { entrees: { 'en1.l03.fiqh_adab': { cercles: ['famille'], lieux: ['cuisine'] } } },
      },
    ]);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  it('catalogue public : rubriques rangées, index officiel appliqué, fiches valides seulement, ETag', async () => {
    const r = await c.req('GET', '/api/v1/vivre');
    expect(r.statusCode).toBe(200);
    const b = r.json() as {
      rangement: string;
      entrees: Array<{
        id: string;
        cercles: string[];
        lieux: string[];
        rangement: string;
        defi?: unknown;
        situations?: number;
      }>;
      fiches: Array<{ id: string }>;
    };
    const by = Object.fromEntries(b.entrees.map((e) => [e.id, e]));
    expect(Object.keys(by).sort()).toEqual([
      'en1.l01.fiqh_adab',
      'en1.l02.fiqh_adab',
      'en1.l03.fiqh_adab',
      'en1.l04.rubriques.1',
    ]);
    expect(by['en1.l01.fiqh_adab']!.cercles).toContain('parents');
    expect(by['en1.l01.fiqh_adab']!.defi).toEqual({ ar: 'نَصٌّ', fr: 'Je range ma chambre.' });
    expect(by['en1.l02.fiqh_adab']!.cercles).toContain('voisins');
    expect(by['en1.l03.fiqh_adab']).toMatchObject({
      cercles: ['famille'],
      lieux: ['cuisine'],
      rangement: 'index',
    });
    expect(by['en1.l04.rubriques.1']).toMatchObject({ cercles: ['nature'], situations: 2 });
    expect(b.rangement).toBe('index');
    // fiche invalide écartée ; fiche d'ESSAI jamais servie sans AWFORM_AKHLAQ_ESSAI=on
    expect(b.fiches.map((f) => f.id)).toEqual(['ok.01', 'ok.02']);
    const again = await c.req('GET', '/api/v1/vivre', {
      'if-none-match': r.headers.etag as string,
    });
    expect(again.statusCode).toBe(304);
  });

  it("leçons atteintes de l'élève (faites + celle où il en est), réservé à sa famille", async () => {
    const { P } = await parent(c, 'a37-parent@e2e.test');
    const id = await child(c, P, 'Essai', 8);
    let r = await c.req('GET', `/api/v1/profiles/${id}/vivre`, P);
    expect(r.statusCode).toBe(200);
    // rien de fait : la première leçon seulement
    expect(r.json()).toMatchObject({ kind: 'enfant', units: ['en1.l01'] });
    await c.h.db
      .insert(t.progress)
      .values({ profileId: id, unitId: 'en1.l01', status: 'terminee' });
    r = await c.req('GET', `/api/v1/profiles/${id}/vivre`, P);
    expect(r.json().units).toEqual(['en1.l01', 'en1.l02']);
    expect((await c.req('GET', `/api/v1/profiles/${id}/vivre`)).statusCode).toBe(401);
    const other = await parent(c, 'a37-autre@e2e.test');
    expect(
      (await c.req('GET', `/api/v1/profiles/${id}/vivre`, other.P)).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });
});
