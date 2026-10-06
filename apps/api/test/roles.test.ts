/**
 * Lot 14 — comptes PostgreSQL séparés : l'API et le travailleur n'ont que les droits nécessaires, table par
 * table ; le propriétaire (migrations, import) reste réservé aux outils. Tourne aussi en CI (sans contenu).
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API_GRANTS,
  applyRoles,
  connect,
  purgeCertificateDocuments,
  purgeDeletedAccounts,
  purgeTutorLog,
  resetTestDatabase,
  roleNames,
  runMigrations,
  purgeAuthThrottle,
  purgeRetention,
  WORKER_GRANTS,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';

const URL_ = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';
const as = (url: string, user: string, password: string) => {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
};

describe.skipIf(!URL_)('comptes PostgreSQL séparés (awform_test)', () => {
  const names = roleNames('awform_t');
  const pw = { api: randomBytes(24).toString('hex'), worker: randomBytes(24).toString('hex') };
  let owner: DbHandle;
  let api: DbHandle;
  let worker: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    owner = connect(URL_, 2);
    await resetTestDatabase(owner.pool);
    await runMigrations(owner.db);
    // niveau minimal (sans contenu des livres : ce test tourne aussi en CI)
    await owner.pool.query(
      "insert into level (code, track, rank, title_fr) values ('en1', 'enfants', 1, 'Niveau 1')",
    );
    await applyRoles(owner.pool, names, pw);
    // idempotent : une seconde application ne change rien et ne casse rien
    await applyRoles(owner.pool, names, pw);
    api = connect(as(URL_!, names.api, pw.api), 2);
    worker = connect(as(URL_!, names.worker, pw.worker), 2);
    app = buildApp({ db: api.db, secretKey: randomBytes(32) });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await api?.close();
    await worker?.close();
    await owner?.close();
  });

  it('chaque table a des droits décidés pour l’API (une nouvelle table doit être classée)', async () => {
    const { rows } = await owner.pool.query<{ t: string }>(
      "select tablename as t from pg_tables where schemaname = 'public' order by 1",
    );
    expect(rows.map((r) => r.t).filter((x) => !(x in API_GRANTS))).toEqual([]);
    expect(Object.keys(WORKER_GRANTS).every((x) => x in API_GRANTS)).toBe(true);
  });

  it('matrice des droits : contenu en lecture seule, journaux en ajout seul, aucun droit du travailleur hors besoin', async () => {
    const can = async (role: string, table: string, right: string) =>
      (
        await owner.pool.query<{ ok: boolean }>('select has_table_privilege($1, $2, $3) as ok', [
          role,
          `public.${table}`,
          right,
        ])
      ).rows[0]!.ok;
    expect(await can(names.api, 'quran_verse', 'SELECT')).toBe(true);
    for (const r of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
      expect(await can(names.api, 'quran_verse', r), r).toBe(false);
    expect(await can(names.api, 'audit_log', 'INSERT')).toBe(true);
    expect(await can(names.api, 'audit_log', 'UPDATE')).toBe(false);
    expect(await can(names.api, 'audit_log', 'DELETE')).toBe(false);
    expect(await can(names.api, 'hifz_event', 'UPDATE')).toBe(false);
    expect(await can(names.api, 'certificate', 'DELETE')).toBe(false);
    expect(await can(names.worker, 'profile', 'SELECT')).toBe(false);
    expect(await can(names.worker, 'attempt', 'SELECT')).toBe(false);
    expect(await can(names.worker, 'account', 'DELETE')).toBe(true);
    expect(await can(names.worker, 'account', 'UPDATE')).toBe(false);
    const { rows } = await owner.pool.query<{ su: boolean; cdb: boolean; cr: boolean }>(
      'select rolsuper as su, rolcreatedb as cdb, rolcreaterole as cr from pg_roles where rolname = $1',
      [names.api],
    );
    expect(rows[0]).toEqual({ su: false, cdb: false, cr: false });
  });

  it('API sous son compte : inscription, profil, consentements, journal — mais aucune DDL ni retouche du Coran', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: { 'x-awform': '1' },
      payload: {
        kind: 'parent',
        birthYear: 1985,
        email: 'roles14@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    const c = cookieOf(r);
    const p = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles',
      headers: { 'x-awform': '1', cookie: c },
      payload: {
        pseudonym: 'Nour',
        birthYear: new Date().getUTCFullYear() - 8,
        levelCode: 'en1',
        password: PW,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      },
    });
    expect(p.statusCode, p.body).toBe(201);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: c } });
    expect(me.json().profiles).toHaveLength(1);
    const deny = async (sql: string) =>
      expect(api.pool.query(sql), sql).rejects.toThrow(/permission denied|must be owner/);
    await deny("insert into quran_verse (sura, aya, text) values (200, 1, 'x')");
    await deny('update audit_log set action = action');
    await deny('delete from audit_log');
    await deny('create table intrus (x int)');
    await deny('select * from drizzle.__drizzle_migrations');
    await deny('drop table profile');
  });

  it('travailleur sous son compte : ses purges passent, le reste est refusé', async () => {
    const now = new Date();
    await expect(purgeDeletedAccounts(worker.db, 30, now)).resolves.toBe(0);
    await expect(purgeTutorLog(worker.db, now)).resolves.toBeGreaterThanOrEqual(0);
    await expect(purgeCertificateDocuments(worker.db, 30, now)).resolves.toBe(0);
    await expect(purgeAuthThrottle(worker.db, now)).resolves.toBeGreaterThanOrEqual(0);
    await expect(purgeRetention(worker.db, now)).resolves.toMatchObject({ journal: 0 });
    await expect(worker.pool.query('select text from tutor_question')).rejects.toThrow(
      /permission denied/,
    );
    await expect(worker.pool.query('select * from auth_throttle')).rejects.toThrow(
      /permission denied/,
    );
    await expect(worker.pool.query('update audit_log set action = action')).rejects.toThrow(
      /permission denied/,
    );
    await expect(worker.pool.query('select * from profile')).rejects.toThrow(/permission denied/);
    await expect(worker.pool.query('select * from session')).rejects.toThrow(/permission denied/);
  });
});
