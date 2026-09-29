/**
 * Audit — RGPD : MIN-5, MIN-6, MIN-7, MIN-8 (un bloc par constat). Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableName, is, Table } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { schema as t } from '@awform/db';
import { child, join, newClass, parent, PW, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit — RGPD', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('MIN-5 : dès la demande de suppression, l’enseignant ne voit plus l’enfant (liste, récitations, audio, CSV)', async () => {
    const T = await teacher(c, 'prof-min5@exemple.org');
    const cls = await newClass(c, T, 'Classe MIN-5');
    const { P } = await parent(c, 'parent-min5@exemple.org');
    const kid = await child(c, P, 'Maryam-min5');
    await join(c, P, kid, cls);
    const [rec] = await c.h.db
      .insert(t.recitationUpload)
      .values({
        profileId: kid,
        classId: cls.id,
        part: '112:1-4',
        mime: 'audio/webm',
        size: 3,
        keyVersion: 1,
        iv: Buffer.alloc(12),
        ciphertext: Buffer.from('abc'),
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      })
      .returning({ id: t.recitationUpload.id });
    const avant = (await c.req('GET', `/api/v1/teacher/classes/${cls.id}`, T)).json();
    expect(avant.members.map((m: { id: string }) => m.id)).toContain(kid);

    const del = await c.req('POST', '/api/v1/account/delete', P, { password: PW });
    expect(del.statusCode, del.body).toBe(200);

    const apres = (await c.req('GET', `/api/v1/teacher/classes/${cls.id}`, T)).json();
    expect(apres.members.map((m: { id: string }) => m.id)).not.toContain(kid);
    const recs = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/recitations`, T)).json();
    expect(recs.recitations).toHaveLength(0);
    const audio = await c.req('GET', `/api/v1/ecole/recitations/${rec!.id}/audio`, T);
    expect(audio.statusCode).toBe(404);
    const csv = await c.req('GET', `/api/v1/ecole/classes/${cls.id}/export.csv`, T);
    expect(csv.body).not.toContain('Maryam-min5');
  });

  it('MIN-6 : l’export contient toute table liée à un compte, un profil ou un élève, sans secret', async () => {
    const T = await teacher(c, 'prof-min6@exemple.org');
    const cls = await newClass(c, T, 'Classe MIN-6');
    const { P } = await parent(c, 'parent-min6@exemple.org');
    const kid = await child(c, P, 'Yusuf-min6');
    await join(c, P, kid, cls);
    await c.h.db.insert(t.profileRhythm).values({ profileId: kid, weeklyGoal: 3 });
    await c.h.db
      .insert(t.tutorQuestion)
      .values({ profileId: kid, unitId: 'x', text: 'question marquée min6', motif: 'test' });
    const ex = await c.req('GET', '/api/v1/account/export', P);
    expect(ex.statusCode, ex.body).toBe(200);
    const e = ex.json();
    // toutes les tables qui portent une clé étrangère vers account, profile ou class_pupil
    const liees = (Object.values(t) as unknown[])
      .filter((v): v is PgTable => is(v, Table))
      .filter((tb) =>
        getTableConfig(tb).foreignKeys.some((f) =>
          ['account', 'profile', 'class_pupil'].includes(getTableName(f.reference().foreignTable)),
        ),
      )
      .map((tb) => getTableName(tb));
    expect(liees.length).toBeGreaterThan(20);
    const manquantes = liees.filter((n) => !Array.isArray(e.donnees?.[n]));
    expect(manquantes).toEqual([]);
    expect(e.donnees.profile_rhythm.map((r: { profileId: string }) => r.profileId)).toContain(kid);
    expect(JSON.stringify(e.donnees.tutor_question)).toContain('question marquée min6');
    expect(e.donnees.class_pupil.map((r: { profileId: string }) => r.profileId)).toContain(kid);
    expect(e.donnees.audit_log.length).toBeGreaterThan(0);
    // aucun secret : ni empreinte de mot de passe, ni TOTP, ni jeton de session, ni audio chiffré
    const txt = ex.body;
    for (const k of [
      'passwordHash',
      'totpSecretEnc',
      'totpPendingEnc',
      'parentPinHash',
      'tokenHash',
      'ciphertext',
    ])
      expect(txt).not.toContain(`"${k}"`);
  });
});
