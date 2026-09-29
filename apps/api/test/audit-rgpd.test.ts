/**
 * Audit — RGPD : MIN-5, MIN-6, MIN-7, MIN-8 (un bloc par constat). Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, getTableName, is, Table } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { purgeAuthThrottle, purgeDeletedAccounts, purgeRetention, schema as t } from '@awform/db';
import {
  adult,
  cookieOf,
  child,
  join,
  newClass,
  parent,
  PW,
  setupEdition,
  teacher,
  type Ctx,
} from './helpers.js';

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

  it('MIN-7 : après l’effacement définitif, ni e-mail en clair, ni âge, ni pays ne restent (verrous, journal)', async () => {
    const { A, profileId } = await adult(c, 'efface-min7@exemple.org');
    const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
    const accountId = me.account.id as string;
    // échecs de connexion : sur ce compte et sur une adresse inconnue
    await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'efface-min7@exemple.org', password: 'faux' },
    );
    await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'inconnu-min7@exemple.org', password: 'x' },
    );
    const keys = (await c.h.db.select({ k: t.authThrottle.key }).from(t.authThrottle)).map(
      (r) => r.k,
    );
    expect(keys.filter((k) => k.includes('@'))).toEqual([]);
    expect((await c.req('POST', '/api/v1/account/delete', A, { password: PW })).statusCode).toBe(
      200,
    );
    expect(
      await purgeDeletedAccounts(c.h.db, 30, new Date(Date.now() + 31 * 86400_000)),
    ).toBeGreaterThanOrEqual(1);
    const reste = await c.h.db.select().from(t.auditLog);
    const cibles = reste.filter((r) => r.target === accountId || r.target === profileId);
    expect(cibles).toEqual([]);
    expect(JSON.stringify(reste)).not.toContain('efface-min7');
    // verrous : effacés au-delà de 24 h (ils contiennent des adresses IP)
    await purgeAuthThrottle(c.h.db, new Date(Date.now() + 25 * 3600_000));
    expect(await c.h.db.select().from(t.authThrottle)).toEqual([]);
  });

  it('MIN-8 : durées de conservation — questions et alertes du tuteur, journal, sessions, paiements abandonnés', async () => {
    const { A, profileId } = await adult(c, 'conservation-min8@exemple.org');
    const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
    const accountId = me.account.id as string;
    const vieux = new Date('2020-01-01T00:00:00Z');
    await c.h.db.insert(t.tutorQuestion).values([
      { profileId, text: 'traitée min8', motif: 'avis', status: 'repondue', createdAt: vieux },
      { profileId, text: 'récente min8', motif: 'avis' },
    ]);
    await c.h.db
      .insert(t.tutorAlert)
      .values({ profileId, motif: 'min8', createdAt: vieux, handledAt: vieux });
    await c.h.db.insert(t.auditLog).values({ action: 'test.min8', at: vieux });
    await c.h.db
      .update(t.session)
      .set({ expiresAt: vieux })
      .where(eq(t.session.accountId, accountId));
    await c.h.db.insert(t.billingCheckout).values({
      accountId,
      planCode: 'adulte_mensuel',
      zone: 'eu',
      currency: 'EUR',
      amount: 500,
      provider: 'simule',
      createdAt: vieux,
    });
    const n = await purgeRetention(c.h.db, new Date());
    expect(n.questionsTuteur).toBeGreaterThanOrEqual(1);
    const qs = await c.h.db
      .select()
      .from(t.tutorQuestion)
      .where(eq(t.tutorQuestion.profileId, profileId));
    expect(qs.map((q) => q.text)).toEqual(['récente min8']);
    expect(
      await c.h.db.select().from(t.tutorAlert).where(eq(t.tutorAlert.profileId, profileId)),
    ).toEqual([]);
    expect(
      await c.h.db.select().from(t.auditLog).where(eq(t.auditLog.action, 'test.min8')),
    ).toEqual([]);
    expect(await c.h.db.select().from(t.session).where(eq(t.session.accountId, accountId))).toEqual(
      [],
    );
    expect(
      await c.h.db
        .select()
        .from(t.billingCheckout)
        .where(eq(t.billingCheckout.accountId, accountId)),
    ).toEqual([]);
  });

  it('MIN-9 : retrait de l’accord « rappels » — préférences coupées, abonnements push effacés, plus rien de dû', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'rappels-min9@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'rappels'],
        birthYear: 1990,
      },
    );
    expect(su.statusCode, su.body).toBe(201);
    const A = { cookie: cookieOf(su) };
    const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
    const accountId = me.account.id as string;
    await c.req('PUT', '/api/v1/notifications', A, {
      devoirs: true,
      rapport: true,
      enfants: false,
      quietStart: 22,
      quietEnd: 6,
      tz: 'Africa/Dakar',
    });
    await c.h.db.insert(t.pushSubscription).values({
      accountId,
      endpoint: 'https://push.example.invalid/x',
      p256dh: 'p',
      auth: 'a',
    });
    const cs = (await c.req('GET', '/api/v1/account/consents', A)).json().consents;
    const rap = cs.find((x: { type: string }) => x.type === 'rappels');
    expect(
      (await c.req('POST', `/api/v1/account/consents/${rap.id}/withdraw`, A, {})).statusCode,
    ).toBe(200);
    const [pref] = await c.h.db
      .select()
      .from(t.notificationPref)
      .where(eq(t.notificationPref.accountId, accountId));
    expect([pref?.devoirs, pref?.rapport, pref?.enfants]).toEqual([false, false, false]);
    expect(
      await c.h.db
        .select()
        .from(t.pushSubscription)
        .where(eq(t.pushSubscription.accountId, accountId)),
    ).toEqual([]);
  });

  it('MIN-10 : envoi de la voix d’un enfant — un code parent doit exister (409 sinon)', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        email: 'sanscode-min10@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
      },
    );
    const P = { cookie: cookieOf(su) };
    const kid = await child(c, P, 'Sans-code');
    const r = await c.req('POST', `/api/v1/profiles/${kid}/recitations/accord`, P, {});
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('code_parent_a_definir');
  });

  it('MIN-11 : retrait du partage enseignant — les récitations envoyées ne reviennent pas après réinscription', async () => {
    const T = await teacher(c, 'prof-min11@exemple.org');
    const cls = await newClass(c, T, 'Classe MIN-11');
    const { P } = await parent(c, 'parent-min11@exemple.org');
    const kid = await child(c, P, 'Retour-min11');
    await join(c, P, kid, cls);
    await c.h.db.insert(t.recitationUpload).values({
      profileId: kid,
      classId: cls.id,
      part: '112:1-4',
      mime: 'audio/ogg',
      size: 3,
      keyVersion: 1,
      iv: Buffer.alloc(12),
      ciphertext: Buffer.from('abc'),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });
    const cs = (await c.req('GET', '/api/v1/account/consents', P)).json().consents;
    const share = cs.find(
      (x: { type: string; profileId: string }) =>
        x.type === 'partage_enseignant' && x.profileId === kid,
    );
    expect(
      (await c.req('POST', `/api/v1/account/consents/${share.id}/withdraw`, P, {})).statusCode,
    ).toBe(200);
    await join(c, P, kid, cls);
    const recs = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/recitations`, T)).json();
    expect(recs.recitations).toHaveLength(0);
    expect(
      await c.h.db.select().from(t.recitationUpload).where(eq(t.recitationUpload.profileId, kid)),
    ).toEqual([]);
  });

  it('MIN-14 : après une demande de suppression, l’adresse est libérée — réinscription possible aussitôt', async () => {
    const { A } = await adult(c, 'revient-min14@exemple.org');
    expect((await c.req('POST', '/api/v1/account/delete', A, { password: PW })).statusCode).toBe(
      200,
    );
    const rows = await c.h.db.select({ e: t.account.email }).from(t.account);
    expect(rows.map((r) => r.e)).not.toContain('revient-min14@exemple.org');
    const again = await adult(c, 'revient-min14@exemple.org');
    expect(again.profileId).toBeTruthy();
  });
});
