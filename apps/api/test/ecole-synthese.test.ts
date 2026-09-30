/**
 * Suite V1-b — tableau de bord « école » : synthèse des classes de l'enseignant (comptes seulement), jamais
 * celles d'un autre enseignant, refus aux familles. Un test par fonction.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activityRate, totals, type ClassSummary } from '../src/ecole-synthese.js';
import { child, join, newClass, parent, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

const row = (o: Partial<ClassSummary>): ClassSummary => ({
  id: 'x',
  nom: 'x',
  niveau: null,
  ecole: null,
  eleves: 0,
  elevesApplication: 0,
  elevesPapier: 0,
  actifs7j: 0,
  devoirsEnCours: 0,
  copiesACorriger: 0,
  certificats: 0,
  recitalsPublies: 0,
  ...o,
});

describe('synthèse école — fonctions pures', () => {
  it('totals : somme de chaque compteur, nombre de classes', () => {
    const t = totals([row({ eleves: 3, actifs7j: 1 }), row({ eleves: 2, certificats: 4 })]);
    expect(t).toMatchObject({ classes: 2, eleves: 5, actifs7j: 1, certificats: 4 });
    expect(totals([])).toMatchObject({ classes: 0, eleves: 0 });
  });
  it('activityRate : actifs / élèves de l’application, arrondi ; null sans élève de l’application', () => {
    expect(activityRate({ actifs7j: 1, elevesApplication: 3 })).toBe(33);
    expect(activityRate({ actifs7j: 0, elevesApplication: 0 })).toBeNull();
  });
});

describe.skipIf(!URL_)('synthèse école (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let fam: Awaited<ReturnType<typeof parent>>;
  let a: { id: string; joinCode: string };
  let b: { id: string; joinCode: string };

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    T = await teacher(c, 'prof-synthese@exemple.org');
    T2 = await teacher(c, 'autre-synthese@exemple.org');
    a = await newClass(c, T, 'CE1 A');
    b = await newClass(c, T, 'CE1 B');
    await newClass(c, T2, 'Classe d’un collègue');
    fam = await parent(c, 'famille-synthese@exemple.org');
    const k1 = await child(c, fam.P, 'Moussa');
    const k2 = await child(c, fam.P, 'Fatou');
    await join(c, fam.P, k1, a);
    await join(c, fam.P, k2, a);
    await c.req('POST', `/api/v1/ecole/classes/${a.id}/pupils`, T, { displayName: 'Papier 1' });
    await c.req('POST', `/api/v1/ecole/classes/${b.id}/pupils`, T, { displayName: 'Papier 2' });
    // une réponse envoyée aujourd'hui par Moussa seulement
    const r = await c.req('POST', '/api/v1/attempts', fam.P, {
      events: [
        {
          id: randomUUID(),
          profileId: k1,
          unitId: 'en1.l01',
          eventType: 'checklist',
          response: { checked: 1, total: 2 },
          deviceAt: new Date().toISOString(),
        },
      ],
    });
    expect(r.json().accepted).toHaveLength(1);
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const d = await c.req('POST', `/api/v1/ecole/classes/${a.id}/assignments`, T, {
      kind: 'lecon',
      target: 'en1.l01',
      dueDay: due,
    });
    expect(d.statusCode, d.body).toBe(201);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('synthèse : comptes par classe, par nom, taux d’activité, totaux', async () => {
    const r = await c.req('GET', '/api/v1/ecole/synthese', T);
    expect(r.statusCode, r.body).toBe(200);
    const s = r.json();
    expect(s.classes.map((x: { nom: string }) => x.nom)).toEqual(['CE1 A', 'CE1 B']);
    expect(s.classes[0]).toMatchObject({
      eleves: 3,
      elevesApplication: 2,
      elevesPapier: 1,
      actifs7j: 1,
      tauxActivite: 50,
      devoirsEnCours: 1,
      copiesACorriger: 0,
      certificats: 0,
      recitalsPublies: 0,
    });
    expect(s.classes[1]).toMatchObject({ eleves: 1, elevesPapier: 1, tauxActivite: null });
    expect(s.totaux).toMatchObject({ classes: 2, eleves: 4, actifs7j: 1 });
    // des comptes seulement : aucun nom d'élève
    expect(r.body).not.toContain('Moussa');
    expect(r.body).not.toContain('Papier 1');
  });

  it('isolement : un autre enseignant ne voit que ses classes ; famille refusée', async () => {
    const s2 = (await c.req('GET', '/api/v1/ecole/synthese', T2)).json();
    expect(s2.classes.map((x: { nom: string }) => x.nom)).toEqual(['Classe d’un collègue']);
    expect((await c.req('GET', '/api/v1/ecole/synthese', fam.P)).statusCode).toBe(403);
    expect((await c.req('GET', '/api/v1/ecole/synthese')).statusCode).toBe(401);
  });
});
