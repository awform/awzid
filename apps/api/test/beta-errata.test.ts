/**
 * Bêta fermée (13/10/2026) — errata PUBLICS avec source :
 *  - une correction d'un texte religieux (verset, hadith, règle) cite toujours sa source (`source_requise`) ;
 *  - le référent peut créer un erratum directement (point religieux trouvé hors signalement de bloc), source obligatoire ;
 *  - la page publique ne montre ni auteur ni commentaire ; la correction est datée.
 * Contenu : édition SYNTHÉTIQUE (aucun texte religieux).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { grantRole, schema as t } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { cookieOf, parent, PW, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

async function admin(c: Ctx, email: string) {
  await c.h.db.insert(t.account).values({
    kind: 'admin',
    email,
    passwordHash: await hashSecret(PW),
    country: 'FR',
  });
  const A = {
    cookie: cookieOf(await c.req('POST', '/api/v1/auth/login', {}, { email, password: PW })),
  };
  const s = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
  const ok = await c.req('POST', '/api/v1/auth/totp/confirm', A, {
    code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
  });
  if (ok.statusCode !== 200) throw new Error(ok.body);
  return A;
}

describe.skipIf(!URL_)('bêta fermée — errata publics avec source (awform_test)', () => {
  let c: Ctx;
  let fam: Awaited<ReturnType<typeof parent>>;
  let A: Record<string, string>;
  let T: Record<string, string>;
  const S = '/api/v1/contenu/signalements';
  const Q = '/api/v1/admin/signalements';

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    fam = await parent(c, 'bl-errata@exemple.org');
    A = await admin(c, 'admin-bl-errata@exemple.org');
    T = await teacher(c, 'maitre-bl-errata@ecole.example');
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('une correction de verset sans source est refusée ; avec sa source, elle est publique et datée', async () => {
    const r = await c.req('POST', S, fam.P, {
      targetKind: 'verset',
      unitId: 'en1.l01',
      reason: 'texte_arabe',
      comment: 'COMMENTAIRE-PRIVE-BL',
    });
    expect(r.statusCode, r.body).toBe(201);
    const id = r.json().id;
    const P = `${Q}/${id}`;
    expect((await c.req('PATCH', P, A, { status: 'en_examen' })).statusCode).toBe(200);
    const sans = await c.req('PATCH', P, A, { status: 'corrige', erratum: 'Voyelle rectifiée.' });
    expect(sans.statusCode).toBe(400);
    expect(sans.json().error.code).toBe('source_requise');
    const avec = await c.req('PATCH', P, A, {
      status: 'corrige',
      erratum: 'Voyelle rectifiée.',
      source: 'Tanzil, sourate 2, verset 255',
      fixedInEdition: 'synth.3',
    });
    expect(avec.statusCode, avec.body).toBe(200);
    const e = (await c.req('GET', '/api/v1/contenu/errata')).json().errata;
    const mine = e.find((x: { id: string }) => x.id === id);
    expect(mine).toMatchObject({
      targetKind: 'verset',
      ref: 'Tanzil, sourate 2, verset 255',
      erratum: 'Voyelle rectifiée.',
      fixedInEdition: 'synth.3',
    });
    expect(Date.parse(mine.date)).toBeGreaterThan(Date.now() - 60_000);
    const brut = JSON.stringify(e);
    expect(brut).not.toContain('COMMENTAIRE-PRIVE-BL');
    expect(brut).not.toMatch(/accountId|account_id|handledBy|bl-errata@/);
  });

  it('la source déjà portée par le signalement suffit ; un exercice n’exige pas de source', async () => {
    const v = await c.req('POST', S, fam.P, {
      targetKind: 'hadith',
      unitId: 'en1.l01',
      path: 'mots.1',
      reason: 'reference',
      ref: 'Muwaṭṭaʾ, livre 1, n° 1',
    });
    expect(v.statusCode, v.body).toBe(201);
    const ok = await c.req('PATCH', `${Q}/${v.json().id}`, A, { status: 'en_examen' });
    expect(ok.statusCode).toBe(200);
    expect(
      (
        await c.req('PATCH', `${Q}/${v.json().id}`, A, {
          status: 'corrige',
          erratum: 'Numéro rectifié.',
        })
      ).statusCode,
    ).toBe(200);
    const x = await c.req('POST', S, fam.P, {
      targetKind: 'exercice',
      unitId: 'en1.l01',
      path: 'ex:en1.l01.ex1',
      reason: 'corrige',
    });
    expect(x.statusCode, x.body).toBe(201);
    await c.req('PATCH', `${Q}/${x.json().id}`, A, { status: 'en_examen' });
    expect(
      (
        await c.req('PATCH', `${Q}/${x.json().id}`, A, {
          status: 'corrige',
          erratum: 'Réponse attendue rectifiée.',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('erratum direct : réservé au référent ou à l’administrateur, source et texte obligatoires, leçon connue', async () => {
    const E = '/api/v1/admin/errata';
    const body = {
      targetKind: 'fiqh',
      unitId: 'en1.l01',
      source: 'Mukhtaṣar Khalīl, chapitre de la prière',
      erratum: 'Condition de validité précisée.',
      fixedInEdition: 'synth.3',
    };
    expect((await c.req('POST', E, {}, body)).statusCode).toBe(401);
    expect((await c.req('POST', E, fam.P, body)).json().error.code).toBe('reserve_referent');
    expect((await c.req('POST', E, T, body)).json().error.code).toBe('reserve_referent');
    // schéma : source et texte vides refusés
    expect((await c.req('POST', E, A, { ...body, source: '' })).statusCode).toBe(400);
    expect((await c.req('POST', E, A, { ...body, erratum: '' })).statusCode).toBe(400);
    expect((await c.req('POST', E, A, { ...body, source: '   ' })).json().error.code).toBe(
      'source_requise',
    );
    expect((await c.req('POST', E, A, { ...body, unitId: 'en9.l99' })).statusCode).toBe(404);
    const ok = await c.req('POST', E, A, body);
    expect(ok.statusCode, ok.body).toBe(201);
    const e = (await c.req('GET', '/api/v1/contenu/errata')).json().errata;
    expect(e.find((x: { id: string }) => x.id === ok.json().id)).toMatchObject({
      targetKind: 'fiqh',
      ref: body.source,
      erratum: body.erratum,
    });
    // décision journalisée
    const log = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'erratum.creation'));
    expect(log.length).toBe(1);
  });

  it('un référent (rôle) peut aussi créer un erratum', async () => {
    const R = await teacher(c, 'referent-bl-errata@exemple.org');
    const [r] = await c.h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'referent-bl-errata@exemple.org'));
    await grantRole(c.h.db, r!.id, 'referent');
    const ok = await c.req('POST', '/api/v1/admin/errata', R, {
      targetKind: 'verset',
      source: 'Tanzil, sourate 1, verset 1',
      erratum: 'Espace en trop retirée.',
    });
    expect(ok.statusCode, ok.body).toBe(201);
  });
});
