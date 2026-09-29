/**
 * Audit MET-1 (bloquant pour les certificats) : un bilan ou un examen fait en ENTRAÎNEMENT dans l'application
 * comptait 100 % (meilleur essai, essais multiples) dans le tableau de suivi et la décision de fin de niveau.
 * Désormais seules comptent la saisie de l'enseignant (classe papier) et l'épreuve notée (session du lot 19).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t } from '@awform/db';
import { child, join, newClass, parent, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit MET-1 — l’entraînement ne compte pas pour la décision', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let cls: { id: string; joinCode: string };
  beforeAll(async () => {
    c = await setupEdition(URL_!);
    const fam = await parent(c, 'met1@exemple.org');
    const awa = await child(c, fam.P, 'Awa');
    T = await teacher(c, 'met1@ecole.example');
    cls = await newClass(c, T, 'Classe MET-1');
    await c.req('PATCH', `/api/v1/ecole/classes/${cls.id}`, T, { levelCode: 'en1' });
    await join(c, fam.P, awa, cls);
    // entraînement : 0 % au premier essai, « terminée » avec le meilleur essai à 100 %
    for (const unitId of ['en1.l03', 'en1.l05'])
      await c.h.db
        .insert(t.progress)
        .values({ profileId: awa, unitId, status: 'terminee', score: 0, bestScore: 1 });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('bilan et examen d’entraînement : absents du tableau, aucune décision ni certificat', async () => {
    const tb = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/tableau`, T)).json();
    const row = tb.rows[0];
    expect(row.bilans).toEqual([null]);
    expect(row.result).toMatchObject({ status: 'incomplet', certificat: false, nf: null });
  });
});
