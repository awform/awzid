/** Espace administrateur minimal : lecture seule, second facteur obligatoire, e-mails masqués. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, resetTestDatabase, runMigrations, schema as t, type DbHandle } from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { maskEmail } from '../src/admin.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

it('masquage des e-mails', () => {
  expect(maskEmail('parent-abc@demo.awform.test')).toBe('p…c@demo.awform.test');
  expect(maskEmail('a@b.c')).toBe('a…@b.c');
  expect(maskEmail(null)).toBeNull();
});

describe.skipIf(!URL)('administration (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const req = (method: 'GET' | 'POST', url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('réservé à l’administrateur, second facteur exigé, e-mails masqués', async () => {
    const adult = cookieOf(
      await req('POST', '/api/v1/auth/signup', '', {
        kind: 'adulte',
        email: 'adulte.adm@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: 1980,
        pseudonym: 'Moi',
      }),
    );
    expect((await req('GET', '/api/v1/admin/overview', adult)).json().error.code).toBe(
      'reserve_admin',
    );
    await h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const admin = cookieOf(
      await req('POST', '/api/v1/auth/login', '', { email: 'admin@exemple.org', password: PW }),
    );
    expect((await req('GET', '/api/v1/admin/overview', admin)).json().error.code).toBe(
      'mfa_a_configurer',
    );
    const s = (await req('POST', '/api/v1/auth/totp/setup', admin, {})).json();
    await req('POST', '/api/v1/auth/totp/confirm', admin, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    const o = (await req('GET', '/api/v1/admin/overview', admin)).json();
    expect(o.comptes.find((c: { kind: string }) => c.kind === 'adulte').n).toBe(1);
    expect(JSON.stringify(o)).not.toContain('adulte.adm@exemple.org');
    expect(o.derniersComptes.some((a: { email: string }) => a.email === 'a…m@exemple.org')).toBe(
      true,
    );
  });
});
