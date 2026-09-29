/**
 * Outils communs aux tests des lots 18 et suivants (base de test, sans les livres) : application, comptes
 * (parent, adulte, enseignant avec second facteur), classe, et petit contenu SYNTHÉTIQUE (édition publiée,
 * niveau, unités, exercices) — jamais de texte religieux ni coranique.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  parseRecitationKey,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import { buildApp, type AppOptions } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { SYNTH_DIR } from './content.js';

export const PW = 'une longue phrase de passe 2026';
export const YEAR = new Date().getUTCFullYear();
export const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

export interface Ctx {
  h: DbHandle;
  app: FastifyInstance;
  editionId: string;
  req: (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    headers?: Record<string, string>,
    payload?: object | Buffer,
  ) => Promise<LightMyRequestResponse>;
}

export interface SeedExercise {
  id: string;
  type: string;
  graded?: boolean;
  items?: number;
  content?: Record<string, unknown>;
}
export interface SeedUnit {
  id: string;
  n: number;
  kind?: 'lecon' | 'bilan' | 'examen';
  content?: Record<string, unknown>;
  student?: Record<string, unknown>;
  exercises?: SeedExercise[];
}

/** Base remise à zéro, migrations, contenu synthétique publié, application prête. */
export async function setup(
  url: string,
  units: SeedUnit[] = [],
  opts: Partial<AppOptions> = {},
): Promise<Ctx> {
  const h = connect(url, 3);
  await resetTestDatabase(h.pool);
  await runMigrations(h.db);
  const [ed] = await h.db
    .insert(t.edition)
    .values({ code: 'test', status: 'publiee', sourceSha256: 'test', publishedAt: new Date() })
    .returning({ id: t.edition.id });
  await h.pool.query(
    "insert into level (code, track, rank, title_fr) values ('en1', 'enfants', 1, 'Niveau 1')",
  );
  for (const u of units) {
    await h.db
      .insert(t.unit)
      .values({ id: u.id, levelCode: 'en1', n: u.n, kind: u.kind ?? 'lecon' });
    await h.db.insert(t.unitVersion).values({
      editionId: ed!.id,
      unitId: u.id,
      numLecon: u.kind === 'lecon' || !u.kind ? u.n : null,
      numBilan: u.kind === 'bilan' ? u.n : null,
      titleAr: 'عُنْوَانٌ',
      titleFr: `Unité ${u.n}`,
      sha256: `u${u.n}`,
      strictJson: true,
      content: u.content ?? { n: u.n, type: u.kind ?? 'lecon', exercices: [] },
      student: u.student ?? u.content ?? { n: u.n, type: u.kind ?? 'lecon', exercices: [] },
    });
    let pos = 0;
    for (const e of u.exercises ?? []) {
      await h.db.insert(t.exercise).values({
        id: e.id,
        unitId: u.id,
        position: ++pos, // comme l’importeur : à partir de 1
        type: e.type,
        graded: e.graded ?? false,
      });
      await h.db.insert(t.exerciseVersion).values({
        editionId: ed!.id,
        exerciseId: e.id,
        hash: `h-${e.id}`,
        itemCount: e.items ?? 1,
        content: e.content ?? { type: e.type },
      });
    }
  }
  const app = buildApp({
    db: h.db,
    secretKey: randomBytes(32),
    recitationKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
    relaisCertsDir: null,
    ...opts,
  });
  await app.ready();
  const req: Ctx['req'] = (method, u, headers = {}, payload) =>
    app.inject({
      method,
      url: u,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...headers },
    });
  return { h, app, editionId: ed!.id, req };
}

/**
 * Base remise à zéro et édition SYNTHÉTIQUE (infra/ci/contenu-synthetique) importée par le vrai importeur :
 * en1 (l01, l02 leçons, l03 bilan, l04 leçon, l05 examen) et ad1 ; toujours la même, livres réels ou non.
 */
export async function setupEdition(
  url: string,
  opts: Partial<AppOptions> = {},
  contentDir = SYNTH_DIR,
): Promise<Ctx> {
  const h = connect(url, 3);
  await resetTestDatabase(h.pool);
  await runMigrations(h.db);
  const r = await importEdition(
    h.db,
    loadEdition({ contentDir, levels: ['en1', 'ad1'], withRegistry: false }),
    { code: 'synth', publish: true },
  );
  const app = buildApp({
    db: h.db,
    secretKey: randomBytes(32),
    recitationKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
    relaisCertsDir: null,
    ...opts,
  });
  await app.ready();
  const req: Ctx['req'] = (method, u, headers = {}, payload) =>
    app.inject({
      method,
      url: u,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...headers },
    });
  return { h, app, editionId: r.editionId, req };
}

/** Parent (FR) avec code parent 4821 ; renvoie ses en-têtes (cookie) et ceux avec le code. */
export async function parent(c: Ctx, email: string) {
  const su = await c.req(
    'POST',
    '/api/v1/auth/signup',
    {},
    { kind: 'parent', birthYear: 1985, email, password: PW, country: 'FR', consents: ['cgu'] },
  );
  if (su.statusCode !== 201) throw new Error(su.body);
  const P = { cookie: cookieOf(su) };
  await c.req('POST', '/api/v1/account/pin', P, { pin: '4821', password: PW });
  return { P, pin: { ...P, 'x-parent-pin': '4821' } };
}

export async function child(c: Ctx, P: Record<string, string>, pseudonym: string, age = 10) {
  const r = await c.req('POST', '/api/v1/profiles', P, {
    pseudonym,
    birthYear: YEAR - age,
    levelCode: 'en1',
    password: PW,
    consents: ['compte_suivi'],
  });
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json().id as string;
}

/** Adulte autonome (profil créé avec le compte). */
export async function adult(c: Ctx, email: string) {
  const su = await c.req(
    'POST',
    '/api/v1/auth/signup',
    {},
    {
      kind: 'adulte',
      email,
      password: PW,
      country: 'FR',
      consents: ['cgu'],
      birthYear: YEAR - 30,
    },
  );
  if (su.statusCode !== 201) throw new Error(su.body);
  const A = { cookie: cookieOf(su) };
  const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
  return { A, profileId: me.profiles[0].id as string };
}

/** Enseignant créé en base (comme la CLI), second facteur configuré et vérifié. */
export async function teacher(c: Ctx, email: string) {
  return (await teacherWithSecret(c, email)).T;
}

/** Idem, avec le secret TOTP (tests du second facteur). */
export async function teacherWithSecret(c: Ctx, email: string) {
  await c.h.db.insert(t.account).values({
    kind: 'enseignant',
    email,
    passwordHash: await hashSecret(PW),
    country: 'SN',
  });
  const T = {
    cookie: cookieOf(await c.req('POST', '/api/v1/auth/login', {}, { email, password: PW })),
  };
  const s = (await c.req('POST', '/api/v1/auth/totp/setup', T, {})).json();
  const ok = await c.req('POST', '/api/v1/auth/totp/confirm', T, {
    code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
  });
  if (ok.statusCode !== 200) throw new Error(ok.body);
  return { T, secret: s.secret as string };
}

export async function newClass(c: Ctx, T: Record<string, string>, name: string) {
  const r = await c.req('POST', '/api/v1/teacher/classes', T, { name });
  if (r.statusCode >= 300) throw new Error(r.body);
  return r.json().class as { id: string; joinCode: string };
}

export async function join(
  c: Ctx,
  P: Record<string, string>,
  profileId: string,
  cls: { joinCode: string },
) {
  // code parent des familles de test (exigé pour un mineur, audit SEC-3 ; ignoré pour un adulte)
  const r = await c.req(
    'POST',
    `/api/v1/profiles/${profileId}/classes`,
    { ...P, 'x-parent-pin': '4821' },
    {
      code: cls.joinCode,
      consent: true,
    },
  );
  if (r.statusCode >= 300) throw new Error(r.body);
}
