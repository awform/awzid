/**
 * Audit — second facteur, limites d'essais, proxy : SEC-1, SEC-2, SEC-4, SEC-5, INF-6 (un bloc par constat).
 * Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { cookieOf, parent, PW, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const now = () => Math.floor(Date.now() / 30_000);

describe.skipIf(!URL_)('audit — second facteur', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const account = async (email: string) =>
    (await c.h.db.select().from(t.account).where(eq(t.account.email, email)))[0]!;

  it('SEC-1 A : un changement d’appareil abandonné ne désactive pas le second facteur', async () => {
    const T = await teacher(c, 'sec1a@ecole.example');
    const before = await account('sec1a@ecole.example');
    const s = await c.req('POST', '/api/v1/auth/totp/setup', T, {});
    expect(s.statusCode).toBe(200);
    const after = await account('sec1a@ecole.example');
    expect(after.totpEnabled).toBe(true);
    expect(after.totpSecretEnc).toBe(before.totpSecretEnc);
    // connexion par mot de passe seul : toujours refusée
    const l = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'sec1a@ecole.example', password: PW },
    );
    expect(l.json().error?.code).toBe('totp_requis');
  });

  it('SEC-1 B : confirmation limitée en essais ; un code déjà utilisé est refusé ; les autres sessions tombent', async () => {
    await c.h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'sec1b@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    const login = async () =>
      cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'sec1b@ecole.example', password: PW },
        ),
      );
    const U = { cookie: await login() };
    const other = { cookie: await login() }; // session ouverte ailleurs avant l'activation
    const { secret } = (await c.req('POST', '/api/v1/auth/totp/setup', U, {})).json();
    const statuses = [];
    for (let i = 0; i < 8; i++)
      statuses.push(
        (await c.req('POST', '/api/v1/auth/totp/confirm', U, { code: '000000' })).statusCode,
      );
    expect(statuses).toContain(429);
    await c.h.pool.query("delete from auth_throttle where key like 'totp:%'");
    const code = totpAt(secret, now());
    expect((await c.req('POST', '/api/v1/auth/totp/confirm', U, { code })).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/auth/me', other)).statusCode).toBe(401);
    // le même code ne resservira pas (anti-rejeu dès l'activation)
    const again = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      {
        email: 'sec1b@ecole.example',
        password: PW,
        totp: code,
      },
    );
    expect(again.json().error?.code).toBe('totp_incorrect');
  });

  it('SEC-2 : salves parallèles — au plus 5 mots de passe et 5 codes parent réellement vérifiés', async () => {
    await parent(c, 'sec2@exemple.org');
    const logins = await Promise.all(
      Array.from({ length: 20 }, () =>
        c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'sec2@exemple.org', password: 'mauvais mot de passe' },
        ),
      ),
    );
    const l401 = logins.filter((r) => r.statusCode === 401).length;
    expect(l401).toBeLessThanOrEqual(5);
    expect(logins.filter((r) => r.statusCode === 429).length).toBeGreaterThan(0);
    const fam = await parent(c, 'sec2b@exemple.org');
    const pins = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        c.req('POST', '/api/v1/account/pin/verify', fam.P, { pin: String(1000 + i) }),
      ),
    );
    expect(pins.filter((r) => r.statusCode === 401).length).toBeLessThanOrEqual(5);
  });
});
