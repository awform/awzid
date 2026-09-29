/**
 * Lot 9 — tuteur IA (fournisseur simulé) : désactivé par défaut, enfant sans texte libre, consentement
 * parental, avis religieux transmis à l'enseignant qui répond, Coran par référence (Tanzil exact),
 * détresse → alerte, journal visible du parent, hors périmètre (religion), plafond.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
  contentDir,
  importEdition,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import { setupTutor } from '@awform/tutor';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(contentDir(), 'data', 'index-lecons.js'));
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

describe.skipIf(!READY)('lot 9 — tuteur (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let off: FastifyInstance;
  let parent = '';
  let adult = '';
  let teacher = '';
  let child = '';
  let teen = '';
  let adultProfile = '';

  const req = (
    a: FastifyInstance,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    cookie = '',
    payload?: object,
  ) =>
    a.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  const ask = (profile: string, cookie: string, body: object) =>
    req(app, 'POST', `/api/v1/tutor/${profile}/ask`, cookie, {
      unitId: 'en1.l05',
      hour: 10,
      ...body,
    });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(h.db, loadEdition({ contentDir: contentDir(), levels: ['en1', 're1'] }), {
      code: 'tuteur',
      publish: true,
    });
    const key = randomBytes(32);
    app = buildApp({ db: h.db, secretKey: key, tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }) });
    off = buildApp({ db: h.db, secretKey: key, tutor: setupTutor({}) });
    await app.ready();
    await off.ready();
    parent = cookieOf(
      await req(app, 'POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        email: 'parent.tuteur@exemple.org',
        password: PW,
        country: 'SN',
        consents: ['cgu', 'transfert_hors_pays'],
      }),
    );
    const mk = async (pseudonym: string, age: number) =>
      (
        await req(app, 'POST', '/api/v1/profiles', parent, {
          pseudonym,
          birthYear: YEAR - age,
          levelCode: 'en1',
          password: PW,
          consents: ['compte_suivi'],
        })
      ).json().id as string;
    child = await mk('Lina', 8);
    teen = await mk('Sami', 15);
    adult = cookieOf(
      await req(app, 'POST', '/api/v1/auth/signup', '', {
        kind: 'adulte',
        email: 'adulte.tuteur@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: 1990,
        pseudonym: 'Moi',
      }),
    );
    const [p] = await h.db
      .select({ id: t.profile.id })
      .from(t.profile)
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(eq(t.account.email, 'adulte.tuteur@exemple.org'));
    adultProfile = p!.id;
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'maitre.tuteur@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    teacher = cookieOf(
      await req(app, 'POST', '/api/v1/auth/login', '', {
        email: 'maitre.tuteur@ecole.example',
        password: PW,
      }),
    );
    const s = (await req(app, 'POST', '/api/v1/auth/totp/setup', teacher, {})).json();
    await req(app, 'POST', '/api/v1/auth/totp/confirm', teacher, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await app?.close();
    await off?.close();
    await h?.close();
  });

  it('désactivé par défaut (AWFORM_TUTEUR absent)', async () => {
    expect((await req(off, 'GET', '/api/v1/tutor/status')).json()).toMatchObject({
      mode: 'off',
      disponible: false,
    });
    expect(
      (
        await req(off, 'POST', `/api/v1/tutor/${child}/ask`, parent, {
          unitId: 'en1.l05',
          action: 'indice',
        })
      ).statusCode,
    ).toBe(404);
    expect((await req(app, 'GET', '/api/v1/tutor/status')).json()).toMatchObject({
      mode: 'simule',
      disponible: true,
    });
  });

  it('enfant : boutons seulement, indice tiré de la banque validée, pas la nuit', async () => {
    const r = (await ask(child, parent, { action: 'indice' })).json();
    expect(r).toMatchObject({ audience: 'enfant', route: 'banque_locale', decision: 'repondre' });
    expect(r.segments[0].t).toBe('explication');
    expect((await ask(child, parent, { action: 'question', text: 'Bonjour' })).json().refus).toBe(
      'texte_libre_interdit',
    );
    expect((await ask(child, parent, { action: 'indice', hour: 22 })).json().refus).toBe('horaire');
    // un autre compte ne peut pas interroger le tuteur pour cet enfant
    expect((await ask(child, adult, { action: 'indice' })).statusCode).toBe(403);
  });

  it('consentement parental : sans lui, pas de modèle pour l’ado', async () => {
    const before = (
      await ask(teen, parent, { action: 'question', text: 'Explique-moi la lettre ر' })
    ).json();
    expect(before.route).toBe('banque_locale');
    expect(
      (await req(app, 'PUT', `/api/v1/profiles/${teen}/tuteur`, parent, { actif: true })).json()
        .actif,
    ).toBe(true);
    const after = (
      await ask(teen, parent, { action: 'question', text: 'Explique-moi la lettre ر' })
    ).json();
    expect(after.route).toBe('modele');
  });

  it('hors périmètre : jamais sur une leçon de religion', async () => {
    expect(
      (
        await req(app, 'POST', `/api/v1/tutor/${adultProfile}/ask`, adult, {
          unitId: 're1.l01',
          action: 'indice',
        })
      ).json().error.code,
    ).toBe('hors_perimetre');
  });

  it('Coran demandé : référence rendue, identique au Tanzil', async () => {
    const r = (
      await ask(adultProfile, adult, { action: 'question', text: 'Écris-moi la sourate Al-Ikhlāṣ' })
    ).json();
    expect(r.route).toBe('coran_local');
    const seg = r.segments.find((s: { t: string }) => s.t === 'coran');
    const verses = (await req(app, 'GET', '/api/v1/quran/verses?s=112&from=1&to=4')).json()
      .verses as Array<{ a: number; text: string }>;
    const expected = verses
      .map((v) => (v.a === 1 ? v.text.split(' ').slice(4).join(' ') : v.text))
      .join(' ');
    expect(seg.text).toBe(expected);
  });

  it('avis religieux : transmis, l’enseignant de la classe répond, l’élève voit la réponse', async () => {
    const r = (
      await ask(adultProfile, adult, {
        action: 'question',
        text: 'Est-ce que la musique est haram ?',
      })
    ).json();
    expect(r).toMatchObject({ decision: 'transmettre', transmise: true });
    // pas encore dans une classe : l'enseignant ne voit rien
    expect(
      (await req(app, 'GET', '/api/v1/teacher/questions', teacher)).json().questions,
    ).toHaveLength(0);
    const c = (
      await req(app, 'POST', '/api/v1/teacher/classes', teacher, { name: 'Adultes' })
    ).json().class;
    await req(app, 'POST', `/api/v1/profiles/${adultProfile}/classes`, adult, {
      code: c.joinCode,
      consent: true,
    });
    const qs = (await req(app, 'GET', '/api/v1/teacher/questions', teacher)).json().questions;
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ pseudonym: 'Moi', text: 'Est-ce que la musique est haram ?' });
    expect((await req(app, 'GET', '/api/v1/teacher/questions', parent)).statusCode).toBe(403);
    expect(
      (
        await req(app, 'POST', `/api/v1/teacher/questions/${qs[0].id}/answer`, teacher, {
          answer: 'Viens me voir après le cours, nous en parlerons.',
        })
      ).json().ok,
    ).toBe(true);
    const mine = (await req(app, 'GET', `/api/v1/tutor/${adultProfile}/questions`, adult)).json()
      .questions;
    expect(mine[0]).toMatchObject({
      status: 'repondue',
      answer: 'Viens me voir après le cours, nous en parlerons.',
    });
  });

  it('détresse : protocole (numéro d’aide du pays) et alerte à la modération', async () => {
    const r = (await ask(teen, parent, { action: 'question', text: 'Mon père me frappe' })).json();
    expect(r.decision).toBe('proteger');
    expect(JSON.stringify(r.segments)).toContain('116');
    const alerts = await h.db.select().from(t.tutorAlert).where(eq(t.tutorAlert.profileId, teen));
    expect(alerts).toHaveLength(1);
  });

  it('journal visible du parent, signalement d’une réponse', async () => {
    const j = (await req(app, 'GET', `/api/v1/tutor/${teen}/journal`, parent)).json();
    expect(j.consentement).toBe(true);
    expect(j.journal.length).toBeGreaterThanOrEqual(3);
    const id = j.journal[0].id;
    expect(
      (await req(app, 'POST', `/api/v1/tutor/${teen}/journal/${id}/signaler`, parent, {})).json()
        .ok,
    ).toBe(true);
    expect((await req(app, 'GET', `/api/v1/tutor/${teen}/journal`, adult)).statusCode).toBe(403);
  });
});
