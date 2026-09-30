/**
 * Lot 23 (V1-g) — codes d'activation imprimés : lot généré par l'administrateur (2FA), codes montrés une fois,
 * usage unique, niveau entier ouvert 12 mois (leçons et paquet hors ligne), anti-essais, révocation.
 * Aucun paiement réel (prestataire simulé).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupBilling, normalizeCode, hashCode } from '@awform/billing';
import { schema as t } from '@awform/db';
import { eq } from 'drizzle-orm';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { adult, child, cookieOf, parent, PW, setup, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const UNITS = [
  { id: 'en1.l01', n: 1 },
  { id: 'en1.l07', n: 7 },
];

describe.skipIf(!URL_)('lot 23 — codes d’activation', () => {
  let c: Ctx;
  let A: Record<string, string>;
  let codes: string[];
  let lotId: string;
  beforeAll(async () => {
    c = await setup(URL_!, UNITS, {
      billing: setupBilling({
        AWFORM_PAIEMENT: 'simule',
        AWFORM_PAIEMENT_SIM_SECRET: 'x',
        AWFORM_DROITS: 'on',
      }),
    });
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin23@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    A = {
      cookie: cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'admin23@exemple.org', password: PW },
        ),
      ),
    };
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('génération : administrateur avec second facteur seulement ; codes en clair montrés une fois', async () => {
    const body = { niveau: 'en1', quantite: 3, libelle: 'Tirage test' };
    expect(
      (await c.req('POST', '/api/v1/admin/activation/lots', A, body)).json().error.code,
    ).toMatch(/totp|mfa/);
    const sec = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
    await c.req('POST', '/api/v1/auth/totp/confirm', A, {
      code: totpAt(sec.secret, Math.floor(Date.now() / 30_000)),
    });
    expect(
      (await c.req('POST', '/api/v1/admin/activation/lots', A, { ...body, niveau: 'zz9' })).json()
        .error.code,
    ).toBe('niveau_inconnu');
    const r = await c.req('POST', '/api/v1/admin/activation/lots', A, body);
    expect(r.statusCode).toBe(201);
    ({ codes } = r.json());
    lotId = r.json().lot.id;
    expect(codes).toHaveLength(3);
    // la base ne garde que l'empreinte
    const rows = await c.h.db
      .select()
      .from(t.activationCode)
      .where(eq(t.activationCode.batchId, lotId));
    expect(rows.map((x) => x.codeHash).sort()).toEqual(
      codes.map((x) => hashCode(normalizeCode(x)!)).sort(),
    );
    expect(JSON.stringify(rows)).not.toContain(codes[0]!.slice(4, 8) + codes[0]!.slice(9, 13));
    const { A: fam } = await adult(c, 'fam23@exemple.org');
    expect((await c.req('POST', '/api/v1/admin/activation/lots', fam, body)).statusCode).toBe(403);
  });

  it('saisie : niveau entier ouvert 12 mois, leçons et paquet hors ligne ; usage unique', async () => {
    const { A: U } = await adult(c, 'u23@exemple.org');
    expect((await c.req('GET', '/api/v1/units/en1.l07', U)).statusCode).toBe(403);
    expect(
      (await c.req('POST', '/api/v1/activation', U, { code: 'AWZ-0000-0000-00001' })).json().error
        .code,
    ).toBe('code_mal_saisi');
    const ok = await c.req('POST', '/api/v1/activation', U, { code: codes[0]!.toLowerCase() });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().niveau).toBe('en1');
    const fin = new Date(ok.json().jusquAu).getTime();
    expect(fin - Date.now()).toBeGreaterThan(360 * 86_400_000);
    expect((await c.req('GET', '/api/v1/units/en1.l07', U)).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/packs/en1', U)).json().error?.code).toBeUndefined();
    expect((await c.req('GET', '/api/v1/activation', U)).json().acces).toHaveLength(1);
    // deuxième saisie du même code, par un autre compte
    const { A: V } = await adult(c, 'v23@exemple.org');
    expect(
      (await c.req('POST', '/api/v1/activation', V, { code: codes[0] })).json().error.code,
    ).toBe('code_inconnu_ou_utilise');
    // un second code prolonge l'accès en cours
    const two = await c.req('POST', '/api/v1/activation', U, { code: codes[1] });
    expect(new Date(two.json().jusquAu).getTime() - fin).toBeGreaterThan(360 * 86_400_000);
  });

  it('parent : le code ouvre le niveau à toute la famille', async () => {
    const { P } = await parent(c, 'p23@exemple.org');
    await child(c, P, 'Lina');
    expect((await c.req('POST', '/api/v1/activation', P, { code: codes[2] })).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/units/en1.l07', P)).statusCode).toBe(200);
  });

  it('anti-essais : verrouillé après 5 codes inconnus', async () => {
    const { A: W } = await adult(c, 'w23@exemple.org');
    // codes bien formés (caractère de contrôle correct) mais jamais émis
    const { generateCode } = await import('@awform/billing');
    const seen: number[] = [];
    for (let i = 0; i < 7; i++)
      seen.push(
        (await c.req('POST', '/api/v1/activation', W, { code: generateCode() })).statusCode,
      );
    expect(seen.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(seen.slice(5)).toEqual([429, 429]);
  });

  it('révocation d’un lot perdu : codes non utilisés refusés, accès ouverts gardés', async () => {
    const r = await c.req('POST', '/api/v1/admin/activation/lots', A, {
      niveau: 'en1',
      quantite: 2,
      libelle: 'Lot perdu',
    });
    const lost = r.json().codes as string[];
    const rv = await c.req('POST', `/api/v1/admin/activation/lots/${r.json().lot.id}/revoquer`, A);
    expect(rv.json().revoques).toBe(2);
    const { A: X } = await adult(c, 'x23@exemple.org');
    expect((await c.req('POST', '/api/v1/activation', X, { code: lost[0] })).statusCode).toBe(404);
    const list = (await c.req('GET', '/api/v1/admin/activation/lots', A)).json().lots;
    expect(list.find((l: { id: string }) => l.id === lotId).utilises).toBe(3);
    // lot échu : code refusé
    const e = await c.req('POST', '/api/v1/admin/activation/lots', A, {
      niveau: 'en1',
      quantite: 1,
      libelle: 'Échu',
      valableJusquau: '2020-01-01',
    });
    expect(
      (await c.req('POST', '/api/v1/activation', X, { code: e.json().codes[0] })).statusCode,
    ).toBe(404);
  });
});
