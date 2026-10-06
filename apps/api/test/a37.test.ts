import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFiche } from '@awform/content/akhlaq';
import { schema as t } from '@awform/db';
import { child, parent, setup, type Ctx } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

/**
 * A37 — « Vivre l'islam », bon comportement : catalogue public (rubriques rangées par l'index officiel des livres,
 * résumés des fiches), fiche entière, chapitre du guide des parents, leçons atteintes d'un élève. Contenu
 * SYNTHÉTIQUE (aucun texte religieux).
 */
describe.skipIf(!url)('A37 — /api/v1/vivre', () => {
  let c: Ctx;
  const bloc = (titre_fr: string, fr: string) => ({
    titre_ar: 'تَجْرِبَةٌ',
    titre_fr,
    points: [{ ar: 'نَصٌّ', fr }],
  });
  const fiche = (id: string, ages: string[]) =>
    parseFiche({
      id,
      titre_fr: `Fiche ${id}`,
      cercle: 'amis',
      lieux: ['ecole'],
      ages,
      situation: { tous: 'Situation synthétique.', enfant: 'Situation enfant.' },
      etapes: {
        avant: [],
        pendant: [{ id: `${id}.pe1`, fr: 'Point.', enfant_fr: 'Point enfant.', statut: 'conseil' }],
        apres: [],
      },
      dire: [],
      defi_fr: 'Défi synthétique.',
    }).fiche!;
  beforeAll(async () => {
    c = await setup(url!, [
      { id: 'en1.l01', n: 1, student: { fiqh_adab: bloc('Essai 1', 'Je range ma chambre.') } },
      { id: 'en1.l02', n: 2, student: { fiqh_adab: bloc('Essai 2', 'Je dis bonjour.') } },
      { id: 'en1.l03', n: 3, student: { fiqh_adab: bloc('Essai 3', 'Je mange.') } },
      {
        id: 'en1.l04',
        n: 4,
        student: {
          rubriques: [
            { code: 'aqida', titre_fr: 'Ignorée' },
            { code: 'adab', titre_fr: 'Essai 4', intro_fr: 'Un chat.', situations: [{}, {}] },
            { code: 'fiqh', titre_fr: 'Absente de l’index' },
          ],
        },
      },
    ]);
    await c.h.db
      .insert(t.levelVersion)
      .values({ editionId: c.editionId, levelCode: 'en1', book: {} });
    const row = (id: string, titre_fr: string, cercle: string, lieux: string[] = []) => ({
      id,
      unit: id.split('.').slice(0, 2).join('.'),
      titre_fr,
      cercles: [cercle],
      lieux,
      fiches: ['ok.01'],
    });
    await c.h.db.insert(t.evalDoc).values([
      {
        editionId: c.editionId,
        key: 'akhlaq.fiches',
        content: { fiches: [fiche('ok.01', ['enfant']), fiche('ok.02', ['adulte'])] },
      },
      {
        editionId: c.editionId,
        key: 'akhlaq.index',
        content: {
          rubriques: [
            row('en1.l01.adab', 'Essai 1', 'parents'),
            row('en1.l02.adab', 'Essai 2', 'voisins'),
            row('en1.l03.adab', 'Essai 3', 'famille', ['cuisine']),
            row('en1.l04.r2', 'Essai 4', 'animaux_nature'),
          ],
        },
      },
    ]);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  it('catalogue public : rubriques de l’index officiel seulement, résumés des fiches, ETag', async () => {
    const r = await c.req('GET', '/api/v1/vivre');
    expect(r.statusCode).toBe(200);
    const b = r.json() as {
      rangement: string;
      entrees: Array<{
        id: string;
        cercles: string[];
        lieux: string[];
        rangement: string;
        fiches?: string[];
      }>;
      fiches: Array<Record<string, unknown>>;
    };
    expect(b.rangement).toBe('index');
    expect(b.entrees.map((e) => [e.id, e.cercles, e.lieux, e.rangement])).toEqual([
      ['en1.l01.fiqh_adab', ['parents'], [], 'index'],
      ['en1.l02.fiqh_adab', ['voisins'], [], 'index'],
      ['en1.l03.fiqh_adab', ['famille'], ['cuisine'], 'index'],
      ['en1.l04.rubriques.1', ['animaux_nature'], [], 'index'],
    ]);
    expect(b.entrees[0]!.fiches).toEqual(['ok.01']);
    // résumés seulement (la fiche entière se charge à l'ouverture) ; aucune fiche d'essai sans la variable
    expect(b.fiches.map((f) => f.id)).toEqual(['ok.01', 'ok.02']);
    expect(b.fiches[0]).not.toHaveProperty('etapes');
    const again = await c.req('GET', '/api/v1/vivre', {
      'if-none-match': r.headers.etag as string,
    });
    expect(again.statusCode).toBe(304);
  });

  it('fiche entière ; guide des parents absent puis publié', async () => {
    const f = await c.req('GET', '/api/v1/vivre/fiches/ok.01');
    expect(f.statusCode).toBe(200);
    expect(f.json().fiche).toMatchObject({
      id: 'ok.01',
      situation: { enfant: 'Situation enfant.' },
    });
    expect((await c.req('GET', '/api/v1/vivre/fiches/inconnue')).statusCode).toBe(404);
    expect((await c.req('GET', '/api/v1/vivre/fiches/essai.chambre.01')).statusCode).toBe(404);
    expect((await c.req('GET', '/api/v1/vivre/guide')).statusCode).toBe(404);
    await c.h.db.insert(t.evalDoc).values({
      editionId: c.editionId,
      key: 'gp.c18',
      content: { id: 'gp.c18', titre_fr: 'Chapitre synthétique', sections: [] },
    });
    const g = await c.req('GET', '/api/v1/vivre/guide');
    expect(g.statusCode).toBe(200);
    expect(g.json().chapitre).toMatchObject({ id: 'gp.c18' });
  });

  it("leçons atteintes de l'élève (faites + celle où il en est), réservé à sa famille", async () => {
    const { P } = await parent(c, 'a37-parent@e2e.test');
    const id = await child(c, P, 'Essai', 8);
    let r = await c.req('GET', `/api/v1/profiles/${id}/vivre`, P);
    expect(r.statusCode).toBe(200);
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
