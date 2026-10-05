/**
 * Lot 18 (V1-a) — correction par l'enseignant des réponses libres : envoi par la famille (code parent pour
 * un enfant, exercice ouvert seulement, classe de l'élève), liste et correction réservées à l'enseignant de la
 * classe, lecture par la famille, nouvel envoi = correction remise à zéro, export RGPD, effacement au départ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t } from '@awform/db';
import { adult, child, join, newClass, parent, setup, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const Q = 'en1.l01.ex1';

describe.skipIf(!URL_)('lot 18 — réponses libres corrigées par l’enseignant (awform_test)', () => {
  let c: Ctx;
  let fam: Awaited<ReturnType<typeof parent>>;
  let awa = '';
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let rid = '';

  beforeAll(async () => {
    c = await setup(URL_!, [
      {
        id: 'en1.l01',
        n: 1,
        exercises: [
          {
            id: Q,
            type: 'question',
            items: 2,
            content: {
              type: 'question',
              consigne_fr: 'Consigne de test',
              items: [{ q_fr: 'A' }, { q_fr: 'B' }],
            },
          },
          { id: 'en1.l01.ex2', type: 'relier', graded: true, items: 3 },
        ],
      },
    ]);
    fam = await parent(c, 'p18@exemple.org');
    awa = await child(c, fam.P, 'Awa');
    T = await teacher(c, 'maitre18@ecole.example');
    T2 = await teacher(c, 'autre18@ecole.example');
    cls = await newClass(c, T, 'Classe 18');
    await join(c, fam.P, awa, cls);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const send = (h: Record<string, string>, body: object, pid = awa) =>
    c.req('POST', `/api/v1/profiles/${pid}/reponses-libres`, h, body);

  it('envoi : code parent pour un enfant ; exercice ouvert, item et classe contrôlés', async () => {
    const body = { classId: cls.id, exerciseId: Q, itemIndex: 0, answer: 'Ma réponse' };
    expect((await send(fam.P, body)).statusCode).toBe(401);
    expect((await send(fam.pin, { ...body, exerciseId: 'en1.l01.ex2' })).json().error.code).toBe(
      'exercice_non_ouvert',
    );
    expect((await send(fam.pin, { ...body, itemIndex: 2 })).json().error.code).toBe('item_inconnu');
    const autre = await newClass(c, T2, 'Autre classe');
    expect((await send(fam.pin, { ...body, classId: autre.id })).statusCode).toBe(404);
    expect((await send(fam.pin, { ...body, answer: '   ' })).statusCode).toBe(400);
    expect((await send(fam.pin, { ...body, answer: 'x'.repeat(2001) })).statusCode).toBe(400);
    const ok = await send(fam.pin, body);
    expect(ok.statusCode, ok.body).toBe(201);
    rid = ok.json().reponse.id;
    // un autre parent ne peut rien envoyer pour cet enfant
    const autreParent = await parent(c, 'autre18@exemple.org');
    expect((await send(autreParent.pin, body)).statusCode).toBe(404);
  });

  it('enseignant de la classe seulement : réponse, pseudonyme et consigne du livre', async () => {
    const r = await c.req(
      'GET',
      `/api/v1/ecole/classes/${cls.id}/reponses-libres?statut=a_corriger`,
      T,
    );
    expect(r.statusCode).toBe(200);
    const [a] = r.json().reponses;
    expect(a).toMatchObject({
      id: rid,
      answer: 'Ma réponse',
      pseudonym: 'Awa',
      appreciation: null,
    });
    expect(a.exercice).toMatchObject({ consigne_fr: 'Consigne de test' });
    expect(
      (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/reponses-libres`, T2)).statusCode,
    ).toBe(404);
    expect(
      (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/reponses-libres`, fam.P)).statusCode,
    ).toBe(403);
  });

  it('correction : appréciation fermée, commentaire court ; un autre enseignant est refusé', async () => {
    const url = `/api/v1/ecole/reponses-libres/${rid}/correction`;
    expect((await c.req('POST', url, T2, { appreciation: 'acquis' })).statusCode).toBe(404);
    expect((await c.req('POST', url, T, { appreciation: '18/20' })).statusCode).toBe(400);
    expect(
      (await c.req('POST', url, T, { appreciation: 'acquis', commentaire: 'x'.repeat(601) }))
        .statusCode,
    ).toBe(400);
    const ok = await c.req('POST', url, T, {
      appreciation: 'en_cours',
      commentaire: 'Relis la leçon.',
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const fam18 = (await c.req('GET', `/api/v1/profiles/${awa}/reponses-libres`, fam.P)).json();
    expect(fam18.reponses[0]).toMatchObject({
      appreciation: 'en_cours',
      comment: 'Relis la leçon.',
    });
    expect(
      (
        await c.req('GET', `/api/v1/ecole/classes/${cls.id}/reponses-libres?statut=a_corriger`, T)
      ).json().reponses,
    ).toHaveLength(0);
    const audit = await c.h.db.select().from(t.auditLog);
    expect(audit.some((x) => x.action === 'reponse_libre.correction')).toBe(true);
  });

  it('nouvel envoi : le texte est remplacé et la correction remise à zéro (pas de doublon)', async () => {
    const r = await send(fam.pin, {
      classId: cls.id,
      exerciseId: Q,
      itemIndex: 0,
      answer: 'Version 2',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().reponse.id).toBe(rid);
    const rows = await c.h.db.select().from(t.freeAnswer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ answer: 'Version 2', appreciation: null, comment: null });
  });

  it('adulte : pas de code parent ; export RGPD complet', async () => {
    const ad = await adult(c, 'adulte18@exemple.org');
    await join(c, ad.A, ad.profileId, cls);
    const r = await send(
      ad.A,
      { classId: cls.id, exerciseId: Q, itemIndex: 1, answer: 'Réponse adulte' },
      ad.profileId,
    );
    expect(r.statusCode, r.body).toBe(201);
    const ex = (await c.req('GET', '/api/v1/account/export', ad.A)).json();
    expect(ex.reponsesLibres.map((x: { answer: string }) => x.answer)).toEqual(['Réponse adulte']);
  });

  // lot F2 (revue E8) : au départ de la classe, les réponses sont ARCHIVÉES (registre de l'école), plus effacées ;
  // elles sortent de la file de l'enseignant et ne sont plus corrigeables
  it('la famille supprime ; quitter la classe archive les réponses envoyées à cette classe', async () => {
    const r2 = await send(fam.pin, { classId: cls.id, exerciseId: Q, itemIndex: 1, answer: 'B' });
    const id2 = r2.json().reponse.id;
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${awa}/reponses-libres/${id2}`, fam.P)).statusCode,
    ).toBe(200);
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${awa}/reponses-libres/${id2}`, fam.P)).statusCode,
    ).toBe(404);
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${awa}/classes/${cls.id}`, fam.P)).statusCode,
    ).toBe(200);
    const left = await c.h.db.select().from(t.freeAnswer);
    expect(left.some((x) => x.profileId === awa)).toBe(true);
    const file = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/reponses-libres`, T)).json();
    expect(file.reponses.every((x: { profileId: string }) => x.profileId !== awa)).toBe(true);
    // l'ancienne réponse n'est plus corrigeable
    expect(
      (
        await c.req('POST', `/api/v1/ecole/reponses-libres/${rid}/correction`, T, {
          appreciation: 'acquis',
        })
      ).statusCode,
    ).toBe(404);
  });
});
