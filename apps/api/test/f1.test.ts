/**
 * Lot F1 « contenu robuste » (revue d'architecture M1, M2, E5, G1) — par l'API, sur la base de test :
 *  - « Signaler une erreur » : compte connecté, limites anti-abus, aucune donnée personnelle dans la file ;
 *  - file du référent (rôle) et de l'administrateur : reçu → en examen → corrigé (erratum public) / rejeté ;
 *  - SUSPENSION D'URGENCE : leçon, exercice ou bloc masqués partout (leçon, paquets hors ligne, QR), levée ;
 *  - épreuve FIGÉE sur l'édition ouverte même si une nouvelle édition est publiée pendant la session (M2) ;
 *  - progression d'une leçon (exercices à refaire), résumé des réponses refusées, langue des explications.
 * Contenu : édition SYNTHÉTIQUE (aucun texte religieux).
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import { grantRole, importEdition, schema as t } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { SYNTH_DIR } from './content.js';
import {
  adult,
  child,
  cookieOf,
  join,
  newClass,
  parent,
  PW,
  setupEdition,
  teacher,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

/** compte administrateur créé en base (comme l'outil staff), second facteur vérifié */
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

describe.skipIf(!URL_)('lot F1 — signalements, suspension, épreuves figées (awform_test)', () => {
  let c: Ctx;
  let fam: Awaited<ReturnType<typeof parent>>;
  let A: Record<string, string>;
  let R: Record<string, string>;
  let T: Record<string, string>;
  let reportId = '';
  const S = '/api/v1/contenu/signalements';

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    fam = await parent(c, 'f1@exemple.org');
    A = await admin(c, 'admin-f1@exemple.org');
    T = await teacher(c, 'maitre-f1@ecole.example');
    R = await teacher(c, 'referent-f1@exemple.org');
    const [r] = await c.h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'referent-f1@exemple.org'));
    await grantRole(c.h.db, r!.id, 'referent');
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('signaler : compte connecté, motif contrôlé, chemin sûr, une fois par bloc et par jour', async () => {
    const body = {
      targetKind: 'exercice',
      unitId: 'en1.l01',
      path: 'ex:en1.l01.ex1',
      reason: 'corrige',
      excerpt: 'Trouve la première lettre.',
      comment: 'La deuxième réponse attendue me semble fausse.',
      edition: 'synth',
    };
    expect((await c.req('POST', S, {}, body)).statusCode).toBe(401);
    expect((await c.req('POST', S, fam.P, { ...body, reason: 'insulte' })).statusCode).toBe(400);
    expect((await c.req('POST', S, fam.P, { ...body, path: '__proto__.x' })).statusCode).toBe(400);
    expect((await c.req('POST', S, fam.P, { ...body, unitId: 'en9.l99' })).statusCode).toBe(404);
    const r = await c.req('POST', S, fam.P, body);
    expect(r.statusCode, r.body).toBe(201);
    reportId = r.json().id;
    expect((await c.req('POST', S, fam.P, body)).json().error.code).toBe('deja_signale');
  });

  it('limitation anti-abus : 10 signalements par compte et par 24 h', async () => {
    const other = await adult(c, 'f1-abus@exemple.org');
    for (let i = 0; i < 10; i++) {
      const r = await c.req('POST', S, other.A, {
        targetKind: 'lecon',
        unitId: 'en1.l01',
        path: `mots.${i}`,
        reason: 'orthographe',
      });
      expect(r.statusCode, r.body).toBe(201);
    }
    const r = await c.req('POST', S, other.A, {
      targetKind: 'lecon',
      unitId: 'en1.l02',
      reason: 'autre',
    });
    expect(r.statusCode).toBe(429);
  });

  it('file : réservée au référent (rôle) et à l’administrateur, sans l’auteur ; transitions contrôlées', async () => {
    const Q = '/api/v1/admin/signalements';
    expect((await c.req('GET', Q, fam.P)).json().error.code).toBe('reserve_referent');
    expect((await c.req('GET', Q, T)).json().error.code).toBe('reserve_referent');
    const q = await c.req('GET', Q, R);
    expect(q.statusCode, q.body).toBe(200);
    expect(q.json().role).toBe('referent');
    const item = q.json().signalements.find((s: { id: string }) => s.id === reportId);
    expect(item).toMatchObject({ targetKind: 'exercice', status: 'recu', reason: 'corrige' });
    expect(JSON.stringify(q.json())).not.toMatch(/accountId|account_id|f1@exemple/);
    const P = `${Q}/${reportId}`;
    expect((await c.req('PATCH', P, R, { status: 'en_examen' })).statusCode).toBe(200);
    expect((await c.req('PATCH', P, R, { status: 'rejete' })).json().error.code).toBe(
      'motif_requis',
    );
    expect((await c.req('PATCH', P, R, { status: 'corrige' })).json().error.code).toBe(
      'erratum_requis',
    );
    const ok = await c.req('PATCH', P, R, {
      status: 'corrige',
      erratum: 'Exercice 1 de la leçon 1 : réponse attendue rectifiée.',
      fixedInEdition: 'synth.2',
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await c.req('PATCH', P, R, { status: 'recu' })).json().error.code).toBe(
      'transition_interdite',
    );
    // errata publics : ni commentaire ni auteur
    const e = (await c.req('GET', '/api/v1/contenu/errata')).json().errata;
    expect(e[0]).toMatchObject({ unitId: 'en1.l01', fixedInEdition: 'synth.2' });
    expect(JSON.stringify(e)).not.toContain('me semble fausse');
    // décision journalisée
    const log = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'signalement.decision'));
    expect(log.length).toBe(2);
  });

  it('suspension d’urgence : administrateur seulement ; exercice, bloc et leçon masqués partout, puis levés', async () => {
    const P = '/api/v1/admin/suspensions';
    const before = (await c.req('GET', '/api/v1/units/en1.l01')).json().unit;
    const manifest0 = (await c.req('GET', '/api/v1/packs')).json();
    expect(
      (await c.req('POST', P, R, { unitId: 'en1.l01', path: 'ex:en1.l01.ex1', reason: 'x' })).json()
        .error.code,
    ).toBe('reserve_admin');
    expect(
      (await c.req('POST', P, A, { unitId: 'en1.l01', path: 'mots.99', reason: 'x' })).json().error
        .code,
    ).toBe('bloc_introuvable');
    const s1 = await c.req('POST', P, A, {
      unitId: 'en1.l01',
      path: 'ex:en1.l01.ex1',
      reason: 'Corrigé faux (signalement)',
      reportId,
    });
    expect(s1.statusCode, s1.body).toBe(201);
    const s2 = await c.req('POST', P, A, {
      unitId: 'en1.l01',
      path: 'mots.0',
      reason: 'Mot à vérifier',
    });
    expect(s2.statusCode, s2.body).toBe(201);
    expect(
      (await c.req('POST', P, A, { unitId: 'en1.l01', path: 'mots.0', reason: 'x' })).statusCode,
    ).toBe(409);

    const u = (await c.req('GET', '/api/v1/units/en1.l01')).json().unit;
    expect(u.lesson.exercices[0]).toEqual({ suspendu: true });
    expect(u.lesson.mots[0]).toEqual({ suspendu: true });
    expect(u.lesson.mots[1]).toEqual(before.lesson.mots[1]);
    expect(u.lesson._suspendu).toBe(2);
    expect(u.sha256).not.toBe(before.sha256);
    // paquets hors ligne : la leçon a changé d'empreinte (mise à jour différentielle) et porte le masque
    const manifest1 = (await c.req('GET', '/api/v1/packs')).json();
    const sha = (m: {
      packs: Array<{ level: string; units: Array<{ id: string; sha256: string }> }>;
    }) => m.packs.find((p) => p.level === 'en1')!.units.find((x) => x.id === 'en1.l01')!.sha256;
    expect(sha(manifest1)).not.toBe(sha(manifest0));
    const pack = (await c.req('GET', '/api/v1/packs/en1')).json();
    expect(pack.units.find((x: { id: string }) => x.id === 'en1.l01').lesson.exercices[0]).toEqual({
      suspendu: true,
    });
    // liste publique (masque des leçons déjà téléchargées sur les appareils)
    const pub = (await c.req('GET', '/api/v1/contenu/suspensions')).json().suspensions;
    expect(pub).toHaveLength(2);
    expect(JSON.stringify(pub)).not.toContain('Corrigé faux');

    // leçon entière : titres seulement, page du QR code neutre
    const s3 = await c.req('POST', P, A, { unitId: 'en1.l02', reason: 'Leçon à revoir' });
    expect(s3.statusCode).toBe(201);
    const u2 = (await c.req('GET', '/api/v1/units/en1.l02')).json().unit;
    expect(u2.lesson._suspendu).toBe('unite');
    expect(u2.exercises).toEqual([]);
    const qr = (await c.req('GET', '/api/v1/public/l/en1-02')).json();
    expect(qr).toMatchObject({ suspendu: true });
    expect(qr.lesson).toBeUndefined();

    // file de l'administrateur : suspensions en cours ; levée journalisée
    const list = (await c.req('GET', '/api/v1/admin/signalements', A)).json().suspensions;
    expect(list).toHaveLength(3);
    for (const s of [s1, s2, s3])
      expect((await c.req('POST', `${P}/${s.json().id}/lever`, A, {})).statusCode).toBe(200);
    expect((await c.req('POST', `${P}/${s1.json().id}/lever`, A, {})).statusCode).toBe(404);
    const after = (await c.req('GET', '/api/v1/units/en1.l01')).json().unit;
    expect(after).toEqual(before);
    const actions = (await c.h.db.select().from(t.auditLog)).map((a) => a.action);
    expect(actions.filter((a) => a === 'contenu.suspension')).toHaveLength(3);
    expect(actions.filter((a) => a === 'contenu.suspension_levee')).toHaveLength(3);
  });

  it('réponses refusées : résumé envoyé par l’appareil (sans contenu), progression d’une leçon', async () => {
    expect(
      (await c.req('POST', '/api/v1/sync/rejets', {}, { count: 1, reasons: { x: 1 } })).statusCode,
    ).toBe(401);
    const r = await c.req('POST', '/api/v1/sync/rejets', fam.P, {
      count: 3,
      reasons: { 'empreinte différente': 3 },
      edition: 'synth',
    });
    expect(r.statusCode).toBe(202);
    const [log] = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'synchro.rejets'));
    expect(log?.after).toEqual({
      nombre: 3,
      motifs: { 'empreinte différente': 3 },
      edition: 'synth',
    });
    const kid = await child(c, fam.P, 'Awa');
    const p = await c.req('GET', `/api/v1/progress/unit?profile=${kid}&unit=en1.l01`, fam.P);
    expect(p.json()).toMatchObject({ unit: 'en1.l01', status: 'ouverte', revised: [] });
    expect(
      (await c.req('GET', `/api/v1/progress/unit?profile=${kid}&unit=en1.l01`, A)).statusCode,
    ).toBe(404);
    // langue des explications (G1) : « fr » par défaut, modifiable, motif contrôlé
    const [pr] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, kid));
    expect(pr?.explanationLocale).toBe('fr');
    expect(
      (await c.req('PATCH', `/api/v1/profiles/${kid}`, fam.pin, { explanationLocale: 'en' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await c.req('PATCH', `/api/v1/profiles/${kid}`, fam.pin, { explanationLocale: 'x1' }))
        .statusCode,
    ).toBe(400);
  });

  it('M2 : une épreuve ouverte reste sur SON édition quand une nouvelle édition est publiée', async () => {
    const kid = await child(c, fam.P, 'Moussa', 11);
    const cls = await newClass(c, T, 'Classe F1');
    await c.req('PATCH', `/api/v1/ecole/classes/${cls.id}`, T, { levelCode: 'en1' });
    await join(c, fam.P, kid, cls);
    const open = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/epreuves`, T, {
      unitId: 'en1.l03',
      closesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(open.statusCode, open.body).toBe(201);
    const sid = open.json().epreuve.id;
    const before = (await c.req('GET', `/api/v1/profiles/${kid}/epreuves/${sid}`, fam.P)).json();

    // nouvelle édition publiée PENDANT la session : titre et corrigé du bilan changés
    const dir = mkdtempSync(joinPath(tmpdir(), 'f1-m2-'));
    cpSync(SYNTH_DIR, dir, { recursive: true });
    const f = joinPath(dir, 'data', 'en1', 'l03.js');
    const s = readFileSync(f, 'utf8');
    const L = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    L.titre_fr = 'Bilan modifié (nouvelle édition)';
    for (const e of L.exercices) if (e.type === 'vrai_faux') e.items[0].vrai = !e.items[0].vrai;
    writeFileSync(f, `AW.lesson(${JSON.stringify(L)});\n`);
    await importEdition(
      c.h.db,
      loadEdition({ contentDir: dir, levels: ['en1', 'ad1'], withRegistry: false }),
      {
        code: 'synth.2',
        publish: true,
      },
    );
    expect((await c.req('GET', '/api/v1/units/en1.l03')).json().unit.titleFr).toBe(
      'Bilan modifié (nouvelle édition)',
    );
    const during = (await c.req('GET', `/api/v1/profiles/${kid}/epreuves/${sid}`, fam.P)).json();
    expect(during.epreuve.titleFr).toBe(before.epreuve.titleFr);
    expect(during.lesson).toEqual(before.lesson);
    // copie corrigée avec le corrigé de l'édition FIGÉE : vrai/faux selon l'ancienne édition
    const vf = during.exercises.find((e: { type: string }) => e.type === 'vrai_faux');
    const copie = await c.req('POST', `/api/v1/profiles/${kid}/epreuves/${sid}/copie`, fam.pin, {
      answers: { [vf.id]: { 0: { value: true }, 1: { value: false } } },
    });
    expect(copie.statusCode, copie.body).toBe(201);
    const [sub] = await c.h.db
      .select()
      .from(t.examSubmission)
      .where(eq(t.examSubmission.id, copie.json().copie.id));
    const detail = sub!.detail as Array<{ exerciseId: string; points: number; max: number }>;
    const res = detail.find((d) => d.exerciseId === vf.id)!;
    // juste selon l'édition FIGÉE (la nouvelle édition aurait compté le premier item faux)
    expect(res.max).toBeGreaterThan(0);
    expect(res.points).toBe(res.max);
    const [sess] = await c.h.db.select().from(t.examSession).where(eq(t.examSession.id, sid));
    expect(sess?.editionId).toBe(c.editionId);
  });
});
