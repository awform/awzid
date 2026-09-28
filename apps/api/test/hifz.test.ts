/**
 * Lot 5 — hifẓ : texte Tanzil octet par octet, carnets, plan, journal (file hors ligne), classes,
 * validation par l'enseignant (note /20), droits d'accès.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL && existsSync(join(contentDir(), 'data', 'index-lecons.js'));
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

function cookieOf(r: LightMyRequestResponse): string {
  const raw = r.headers['set-cookie'];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? '').split(';')[0] ?? '';
}

function tanzilTsv(): Map<string, string> {
  const m = new Map<string, string>();
  const src = readFileSync(join(contentDir(), 'coran', 'tanzil-uthmani.tsv'), 'utf8');
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const tab = line.indexOf('\t');
    if (tab > 0)
      m.set(line.slice(0, tab).replace(/^\uFEFF/, ''), line.slice(tab + 1).replace(/^\uFEFF/, ''));
  }
  return m;
}

describe.skipIf(!READY)('hifẓ (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const key = randomBytes(32);
  let parent = '';
  let child = '';
  let other = '';
  let teacher = '';

  const req = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    cookie = '',
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: contentDir(), levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'hifz', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: key });
    await app.ready();
    const signup = async (email: string) =>
      cookieOf(
        await req('POST', '/api/v1/auth/signup', '', {
          kind: 'parent',
          email,
          password: PW,
          country: 'FR',
          consents: ['cgu'],
        }),
      );
    parent = await signup('parent.hifz@exemple.org');
    other = await signup('autre.hifz@exemple.org');
    const r = await req('POST', '/api/v1/profiles', parent, {
      pseudonym: 'Aïcha',
      birthYear: YEAR - 8,
      levelCode: 'en1',
      password: PW,
      consents: ['compte_suivi'],
    });
    child = r.json().id;
    // enseignant avec second facteur
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'maitre@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    teacher = cookieOf(
      await req('POST', '/api/v1/auth/login', '', { email: 'maitre@ecole.example', password: PW }),
    );
    const setup = (await req('POST', '/api/v1/auth/totp/setup', teacher, {})).json();
    await req('POST', '/api/v1/auth/totp/confirm', teacher, {
      code: totpAt(setup.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('texte coranique servi = Tanzil, octet par octet ; métadonnées complètes', async () => {
    const tsv = tanzilTsv();
    const v = (await req('GET', '/api/v1/quran/verses?s=112&from=1&to=4')).json();
    expect(v.verses).toHaveLength(4);
    for (const x of v.verses)
      expect(Buffer.from(x.text)).toEqual(Buffer.from(tsv.get(`${x.s}:${x.a}`)!));
    const m = await req('GET', '/api/v1/quran/meta');
    const meta = m.json();
    expect(meta.basmala).toBe(tsv.get('1:1'));
    expect(meta.weights.flat()).toHaveLength(6236);
    const again = await req('GET', '/api/v1/quran/meta');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/quran/meta',
          headers: { 'if-none-match': String(again.headers.etag) },
        })
      ).statusCode,
    ).toBe(304);
    expect((await req('GET', '/api/v1/quran/verses?s=2&from=1&to=286')).statusCode).toBe(200);
    expect((await req('GET', '/api/v1/quran/verses?s=115&from=1&to=2')).statusCode).toBe(400);
  });

  it('carnets E1 et N1 : versets cités fournis depuis Tanzil', async () => {
    const tsv = tanzilTsv();
    expect((await req('GET', '/api/v1/hifz/books')).json().books.sort()).toEqual(['ad1', 'en1']);
    const b = (await req('GET', '/api/v1/hifz/books/ad1')).json();
    expect(b.book.semaines).toBe(30);
    expect(Object.keys(b.verses)).toContain('2:255');
    for (const [ref, text] of Object.entries(b.verses)) expect(text).toBe(tsv.get(ref));
    expect((await req('GET', '/api/v1/hifz/books/zz9')).statusCode).toBe(404);
  });

  it('plan : décidé par le titulaire, invisible pour un autre compte', async () => {
    expect((await req('GET', `/api/v1/hifz/profiles/${child}`)).statusCode).toBe(401);
    const bad = await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, parent, {
      mode: 'carnet',
      bookCode: 'zz9',
      startDate: TODAY,
    });
    expect(bad.json().error.code).toBe('carnet_inconnu');
    const ok = await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, parent, {
      mode: 'carnet',
      bookCode: 'en1',
      startDate: TODAY,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().plan).toMatchObject({ mode: 'carnet', bookCode: 'en1', rhythmYears: null });
    expect((await req('GET', `/api/v1/hifz/profiles/${child}`, other)).statusCode).toBe(404);
    expect(
      (
        await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, other, {
          mode: 'rythme',
          rhythmYears: 3,
          startDate: TODAY,
        })
      ).statusCode,
    ).toBe(404);
    const rythme = await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, parent, {
      mode: 'rythme',
      rhythmYears: 7,
      suraOrder: 'juz30',
      trial: true,
      startDate: TODAY,
    });
    expect(rythme.json().plan).toMatchObject({
      mode: 'rythme',
      rhythmYears: 7,
      trial: true,
      bookCode: null,
    });
    expect(
      (
        await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, parent, {
          mode: 'rythme',
          rhythmYears: 9,
          startDate: TODAY,
        })
      ).statusCode,
    ).toBe(400);
    await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, parent, {
      mode: 'carnet',
      bookCode: 'en1',
      startDate: TODAY,
    });
  });

  it('journal par la file hors ligne : idempotent, sources de la famille seulement', async () => {
    const ev = (response: object) => ({
      id: randomUUID(),
      profileId: child,
      unitId: 'hifz',
      eventType: 'hifz',
      response,
      deviceAt: new Date().toISOString(),
    });
    const a = ev({
      day: TODAY,
      part: '112:1-4',
      kind: 'appris',
      source: 'auto',
      details: { v: '1-2' },
    });
    const b = ev({ day: TODAY, part: '112:1-4', kind: 'revision', q: 3, source: 'parent' });
    const forged = ev({
      day: TODAY,
      part: '112:1-4',
      kind: 'revision',
      q: 3,
      source: 'enseignant',
    });
    const badQ = ev({ day: TODAY, part: '112:1-4', kind: 'revision', q: 7, source: 'auto' });
    const r = (
      await req('POST', '/api/v1/attempts', parent, { events: [a, b, forged, badQ] })
    ).json();
    expect(r.accepted.map((x: { id: string }) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(r.rejected.map((x: { reason: string }) => x.reason).sort()).toEqual([
      'résultat invalide',
      'source non autorisée',
    ]);
    const again = (await req('POST', '/api/v1/attempts', parent, { events: [a] })).json();
    expect(again.duplicates).toEqual([a.id]);
    const stolen = (
      await req('POST', '/api/v1/attempts', other, {
        events: [ev({ day: TODAY, part: '1:1-7', kind: 'appris', source: 'auto' })],
      })
    ).json();
    expect(stolen.rejected[0].reason).toBe('profil non autorisé');
    const j = (await req('GET', `/api/v1/hifz/profiles/${child}`, parent)).json();
    expect(j.events).toHaveLength(2);
  });

  it('classe : le parent inscrit son enfant, l’enseignant valide (note /20), le retrait coupe l’accès', async () => {
    expect((await req('GET', '/api/v1/teacher/classes', parent)).statusCode).toBe(403);
    const c = (
      await req('POST', '/api/v1/teacher/classes', teacher, { name: 'Hifẓ — groupe A' })
    ).json().class;
    expect(c.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // avant l'inscription : l'enseignant ne voit rien
    expect((await req('GET', `/api/v1/hifz/profiles/${child}`, teacher)).statusCode).toBe(404);
    expect(
      (
        await req('POST', `/api/v1/profiles/${child}/classes`, parent, {
          code: c.joinCode,
          consent: false,
        })
      ).json().error.code,
    ).toBe('consentement_requis');
    expect(
      (
        await req('POST', `/api/v1/profiles/${child}/classes`, parent, {
          code: 'ZZZZZZZZ',
          consent: true,
        })
      ).json().error.code,
    ).toBe('code_classe_inconnu');
    expect(
      (
        await req('POST', `/api/v1/profiles/${child}/classes`, other, {
          code: c.joinCode,
          consent: true,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req('POST', `/api/v1/profiles/${child}/classes`, parent, {
          code: c.joinCode.toLowerCase(),
          consent: true,
        })
      ).statusCode,
    ).toBe(201);
    const detail = (await req('GET', `/api/v1/teacher/classes/${c.id}`, teacher)).json();
    expect(detail.members.map((m: { pseudonym: string }) => m.pseudonym)).toEqual(['Aïcha']);
    expect(detail.members[0].plan.bookCode).toBe('en1');

    const v = await req('POST', '/api/v1/teacher/hifz/validations', teacher, {
      id: randomUUID(),
      profileId: child,
      day: TODAY,
      part: '112:1-4',
      counters: {
        aides: 2,
        hesitations: 1,
        sauts: 0,
        oublis: 0,
        claires: 0,
        discretes: 1,
        fluidite: 4,
      },
    });
    expect(v.statusCode).toBe(200);
    expect(v.json().note).toMatchObject({ total: 17, mention: 'tres_bien', validation: 'oui' });
    expect(v.json().q).toBe(3);
    // le parent voit la validation officielle dans le journal
    const j = (await req('GET', `/api/v1/hifz/profiles/${child}`, parent)).json();
    expect(
      j.events.find((e: { source: string }) => e.source === 'enseignant').details.note.total,
    ).toBe(17);
    expect(j.classes.map((x: { name: string }) => x.name)).toEqual(['Hifẓ — groupe A']);
    // l'enseignant peut décider du rythme après le mois d'essai
    expect(
      (
        await req('PUT', `/api/v1/hifz/profiles/${child}/plan`, teacher, {
          mode: 'carnet',
          bookCode: 'en1',
          startDate: TODAY,
        })
      ).statusCode,
    ).toBe(200);
    // retrait du consentement « partage_enseignant » → l'enfant quitte la classe
    const consents = (await req('GET', '/api/v1/account/consents', parent)).json().consents;
    const share = consents.find((x: { type: string }) => x.type === 'partage_enseignant');
    expect(share.optional).toBe(true);
    expect(
      (await req('POST', `/api/v1/account/consents/${share.id}/withdraw`, parent, {})).statusCode,
    ).toBe(200);
    expect((await req('GET', `/api/v1/hifz/profiles/${child}`, teacher)).statusCode).toBe(404);
    expect(
      (
        await req('POST', '/api/v1/teacher/hifz/validations', teacher, {
          id: randomUUID(),
          profileId: child,
          day: TODAY,
          part: '112:1-4',
          counters: {
            aides: 0,
            hesitations: 0,
            sauts: 0,
            oublis: 0,
            claires: 0,
            discretes: 0,
            fluidite: 4,
          },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('export RGPD : plan, journal et classes du hifẓ inclus', async () => {
    const e = (await req('GET', '/api/v1/account/export', parent)).json();
    expect(e.hifz.plans).toHaveLength(1);
    expect(e.hifz.journal.length).toBeGreaterThanOrEqual(3);
    const rows = await h.db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, child));
    expect(rows.length).toBe(e.hifz.journal.length);
  });

  it('code de l’adulte ou de l’enseignant : protège aussi un appareil partagé', async () => {
    const pin = await req('POST', '/api/v1/account/pin', teacher, { pin: '1357', password: PW });
    expect(pin.statusCode).toBe(200);
    expect(
      (await req('POST', '/api/v1/account/pin/verify', teacher, { pin: '1357' })).statusCode,
    ).toBe(200);
    expect(
      (await req('POST', '/api/v1/account/pin/verify', teacher, { pin: '0000' })).statusCode,
    ).toBe(401);
  });
});
