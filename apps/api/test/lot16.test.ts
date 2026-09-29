/**
 * Lot 16 — récitations envoyées à l'enseignant (chiffrées, conservation courte, suppression par la famille,
 * accès limité à l'enseignant de la classe, note /20 commune) et notifications respectueuses (désactivées
 * par défaut, heures calmes, enfants seulement avec l'accord du parent, textes sans culpabilisation).
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  connect,
  dueNotifications,
  inQuietHours,
  markSent,
  parseRecitationKey,
  purgeExpiredRecitations,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';

const URL_ = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';
const AUDIO = Buffer.concat([Buffer.from('OggS'), randomBytes(4000)]);

describe.skipIf(!URL_)('lot 16 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let appSansCle: FastifyInstance;
  let parent = '';
  let autre = '';
  let teacher = '';
  let teacher2 = '';
  let child = '';
  let classId = '';
  let recId = '';
  type M = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const req = (
    method: M,
    url: string,
    cookie = '',
    payload?: object | Buffer,
    headers: Record<string, string> = {},
    a = app,
  ) =>
    a.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: {
        ...(method !== 'GET' ? { 'x-awform': '1' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    });
  const staff = async (email: string) => {
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email,
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    const c = cookieOf(await req('POST', '/api/v1/auth/login', '', { email, password: PW }));
    const s = (await req('POST', '/api/v1/auth/totp/setup', c, {})).json();
    await req('POST', '/api/v1/auth/totp/confirm', c, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    return c;
  };
  const signup = async (email: string) =>
    cookieOf(
      await req('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: PW,
        country: 'FR',
        consents: ['cgu'],
      }),
    );

  beforeAll(async () => {
    h = connect(URL_, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await h.pool.query(
      "insert into level (code, track, rank, title_fr) values ('en1', 'enfants', 1, 'Niveau 1')",
    );
    process.env.AWFORM_VAPID_PUBLIC = `B${'A'.repeat(86)}`;
    app = buildApp({
      db: h.db,
      secretKey: randomBytes(32),
      recitationKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
    });
    appSansCle = buildApp({ db: h.db, secretKey: randomBytes(32), recitationKey: null });
    await app.ready();
    await appSansCle.ready();
    parent = await signup('p16@exemple.org');
    autre = await signup('autre16@exemple.org');
    child = (
      await req('POST', '/api/v1/profiles', parent, {
        pseudonym: 'Khadija',
        birthYear: YEAR - 9,
        levelCode: 'en1',
        password: PW,
        consents: ['compte_suivi'],
      })
    ).json().id;
    teacher = await staff('maitre16@ecole.example');
    teacher2 = await staff('autre16@ecole.example');
    const c = (await req('POST', '/api/v1/teacher/classes', teacher, { name: 'Hifẓ 16' })).json()
      .class;
    classId = c.id;
    await req('POST', `/api/v1/profiles/${child}/classes`, parent, {
      code: c.joinCode,
      consent: true,
    });
    await req('PATCH', `/api/v1/ecole/classes/${classId}`, teacher, { recitationDays: 7 });
  });
  afterAll(async () => {
    await app?.close();
    await appSansCle?.close();
    await h?.close();
  });

  const send = (
    cookie = parent,
    headers: Record<string, string> = {},
    body: Buffer = AUDIO,
    a = app,
  ) =>
    req(
      'POST',
      `/api/v1/profiles/${child}/recitations?classe=${classId}&passage=112:1-4&duree=40`,
      cookie,
      body,
      { 'content-type': 'audio/ogg', ...headers },
      a,
    );

  it('envoi : accord de la famille exigé ; enfant : code parent ; audio et classe contrôlés', async () => {
    expect((await send()).json().error.code).toBe('accord_requis');
    // code parent posé : l'accord pour un ENFANT l'exige
    await req('POST', '/api/v1/account/pin', parent, { pin: '4821', password: PW });
    expect(
      (await req('POST', `/api/v1/profiles/${child}/recitations/accord`, parent, {})).json().error
        .code,
    ).toBe('code_parent_incorrect');
    expect(
      (
        await req(
          'POST',
          `/api/v1/profiles/${child}/recitations/accord`,
          parent,
          {},
          {
            'x-parent-pin': '4821',
          },
        )
      ).statusCode,
    ).toBe(200);
    const prot = (await req('GET', `/api/v1/profiles/${child}/protections`, parent)).json();
    expect(prot.enregistrementsEnvoyes).toBe(true);
    // enfant : chaque envoi demande le code parent
    expect((await send()).json().error.code).toBe('code_parent_incorrect');
    const P = { 'x-parent-pin': '4821' };
    expect(
      (
        await req(
          'POST',
          `/api/v1/profiles/${child}/recitations?classe=${classId}&passage=112:1-4`,
          parent,
          Buffer.from('{}'),
          { 'content-type': 'application/json', ...P },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await req(
          'POST',
          `/api/v1/profiles/${child}/recitations?classe=00000000-0000-7000-8000-000000000000&passage=112:1-4`,
          parent,
          AUDIO,
          { 'content-type': 'audio/ogg', ...P },
        )
      ).json().error.code,
    ).toBe('classe_inconnue');
    expect((await send(autre, P)).statusCode).toBe(404);
    expect((await send(teacher, P)).statusCode).toBe(403);
    expect((await send(parent, P, AUDIO, appSansCle)).json().error.code).toBe('envoi_indisponible');
    const ok = await send(parent, P);
    expect(ok.statusCode, ok.body).toBe(201);
    recId = ok.json().recitation.id;
    // conservation réglée par la classe (7 jours)
    const days =
      (Date.parse(ok.json().recitation.expiresAt) - Date.parse(ok.json().recitation.createdAt)) /
      86_400_000;
    expect(days).toBeCloseTo(7, 5);
  });

  it('stockage CHIFFRÉ : l’audio n’apparaît pas en clair dans la base', async () => {
    const [row] = await h.db
      .select()
      .from(t.recitationUpload)
      .where(eq(t.recitationUpload.id, recId));
    expect(row!.ciphertext.includes(AUDIO.subarray(4, 64))).toBe(false);
    expect(row!.ciphertext.length).toBe(AUDIO.length + 16);
  });

  it('écoute : l’enseignant de la classe seulement ; note /20 commune dans le journal de hifẓ', async () => {
    expect(
      (await req('GET', `/api/v1/ecole/classes/${classId}/recitations`, teacher2)).statusCode,
    ).toBe(404);
    expect(
      (await req('GET', `/api/v1/ecole/recitations/${recId}/audio`, teacher2)).statusCode,
    ).toBe(404);
    expect((await req('GET', `/api/v1/ecole/recitations/${recId}/audio`, parent)).statusCode).toBe(
      403,
    );
    const list = (await req('GET', `/api/v1/ecole/classes/${classId}/recitations`, teacher)).json();
    expect(list.jours).toBe(7);
    expect(list.recitations.map((r: { pseudonym: string }) => r.pseudonym)).toEqual(['Khadija']);
    expect(JSON.stringify(list)).not.toContain('ciphertext');
    const audio = await req('GET', `/api/v1/ecole/recitations/${recId}/audio`, teacher);
    expect(audio.headers['content-type']).toMatch(/audio\/ogg/);
    expect(audio.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(audio.rawPayload, AUDIO)).toBe(0);
    const n = await req('POST', `/api/v1/ecole/recitations/${recId}/note`, teacher, {
      counters: {
        aides: 0,
        hesitations: 2,
        sauts: 0,
        oublis: 0,
        claires: 1,
        discretes: 0,
        fluidite: 4,
      },
    });
    expect(n.json().note.total).toBe(18);
    const ev = await h.db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, child));
    expect(ev.find((e) => e.source === 'enseignant')?.part).toBe('112:1-4');
    const fam = (await req('GET', `/api/v1/profiles/${child}/recitations`, parent)).json();
    expect(fam.recitations[0].grade.note.total).toBe(18);
    expect(fam.recitations[0].listenedAt).not.toBeNull();
    const log = await h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'recitation.ecoute'));
    expect(log).toHaveLength(1);
  });

  it('famille : suppression immédiate ; échéance : effacement automatique', async () => {
    expect(
      (await req('DELETE', `/api/v1/profiles/${child}/recitations/${recId}`, autre)).statusCode,
    ).toBe(404);
    expect(
      (await req('DELETE', `/api/v1/profiles/${child}/recitations/${recId}`, parent)).statusCode,
    ).toBe(200);
    expect((await req('GET', `/api/v1/ecole/recitations/${recId}/audio`, teacher)).statusCode).toBe(
      404,
    );
    const again = await send(parent, { 'x-parent-pin': '4821' });
    expect(again.statusCode).toBe(201);
    expect(await purgeExpiredRecitations(h.db, new Date())).toBe(0);
    expect(await purgeExpiredRecitations(h.db, new Date(Date.now() + 8 * 86_400_000))).toBe(1);
  });

  it('retrait de l’accord : les envois sont effacés et plus rien ne part', async () => {
    const r = await send(parent, { 'x-parent-pin': '4821' });
    expect(r.statusCode).toBe(201);
    const consents = (await req('GET', '/api/v1/account/consents', parent)).json().consents;
    const c = consents.find(
      (x: { type: string; withdrawnAt: string | null }) =>
        x.type === 'envoi_recitation' && !x.withdrawnAt,
    );
    expect(
      (await req('POST', `/api/v1/account/consents/${c.id}/withdraw`, parent, {})).statusCode,
    ).toBe(200);
    const left = await h.db
      .select()
      .from(t.recitationUpload)
      .where(eq(t.recitationUpload.profileId, child));
    expect(left).toHaveLength(0);
    expect((await send(parent, { 'x-parent-pin': '4821' })).json().error.code).toBe(
      'accord_requis',
    );
  });

  it('notifications : désactivées par défaut ; heures calmes ≥ 8 h ; enfants avec le code parent', async () => {
    const d = (await req('GET', '/api/v1/notifications', parent)).json();
    expect(d.preferences).toMatchObject({ devoirs: false, rapport: false, enfants: false });
    const prefs = {
      devoirs: true,
      rapport: true,
      enfants: true,
      quietStart: 22,
      quietEnd: 6,
      tz: 'UTC',
    };
    expect(
      (
        await req('PUT', '/api/v1/notifications', parent, { ...prefs, quietStart: 23, quietEnd: 2 })
      ).json().error.code,
    ).toBe('heures_calmes_trop_courtes');
    expect((await req('PUT', '/api/v1/notifications', parent, prefs)).json().error.code).toBe(
      'code_parent_incorrect',
    );
    expect(
      (await req('PUT', '/api/v1/notifications', parent, prefs, { 'x-parent-pin': '4821' }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await req('POST', '/api/v1/notifications/abonnement', parent, {
          endpoint: 'https://push.example.test/abc',
          keys: { p256dh: 'BCDEF', auth: 'xyz' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await req('POST', '/api/v1/notifications/abonnement', parent, {
          endpoint: 'http://non-chiffre.example.test/x',
          keys: { p256dh: 'B', auth: 'x' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('notifications : devoir de demain, une fois, pas en heures calmes, sans nom ni culpabilisation', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await req('POST', `/api/v1/ecole/classes/${classId}/assignments`, teacher, {
      kind: 'hifz',
      target: '112:1-4',
      dueDay: tomorrow,
    });
    const today = new Date().toISOString().slice(0, 10);
    const at = (hh: number) => new Date(`${today}T${String(hh).padStart(2, '0')}:30:00Z`);
    expect(await dueNotifications(h.db, at(23))).toEqual([]); // heures calmes
    expect(await dueNotifications(h.db, at(9))).toEqual([]); // avant 17 h
    const due = await dueNotifications(h.db, at(18));
    const dv = due.find((n) => n.kind === 'devoirs')!;
    expect(dv.payload.body).toMatch(/Un devoir est prévu pour demain/);
    expect(JSON.stringify(dv.payload)).not.toMatch(/Khadija|retard|dernière chance|vite/i);
    expect(dv.subscriptions).toHaveLength(1);
    await markSent(h.db, dv.accountId, 'devoirs', dv.day);
    expect((await dueNotifications(h.db, at(19))).filter((n) => n.kind === 'devoirs')).toEqual([]);
    // sans l'accord « enfants », rien pour un profil d'enfant
    await h.db.update(t.notificationPref).set({ enfants: false, lastDevoirs: null });
    expect(await dueNotifications(h.db, at(18))).toEqual([]);
  });

  it('régression : un refus arrête vraiment la requête (aucune écriture pour un autre compte)', async () => {
    const before = await h.db.select().from(t.profileRhythm);
    const r = await req('PUT', `/api/v1/profiles/${child}/regularite`, autre, {
      objectif: 5,
      repos: [],
    });
    expect(r.statusCode).toBe(404);
    expect(await h.db.select().from(t.profileRhythm)).toEqual(before);
    const n = await h.db.select().from(t.recitationUpload);
    expect((await send(autre, { 'x-parent-pin': '4821' })).statusCode).toBe(404);
    expect(await h.db.select().from(t.recitationUpload)).toHaveLength(n.length);
  });

  it('heures calmes : passage de minuit', () => {
    expect(inQuietHours(23, 20, 8)).toBe(true);
    expect(inQuietHours(7, 20, 8)).toBe(true);
    expect(inQuietHours(8, 20, 8)).toBe(false);
    expect(inQuietHours(19, 20, 8)).toBe(false);
    expect(inQuietHours(13, 12, 14)).toBe(true);
  });
});
