/**
 * Audit — sécurité (mineurs) : SEC-6 (ressaisie du mot de passe limitée), SEC-8 (événements bornés et schémas
 * fermés). Chaque bloc échouait avant sa correction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adult, child, parent, PW, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit — sécurité', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it.each([
    [
      'POST',
      '/api/v1/auth/password',
      (pw: string) => ({ current: pw, next: 'une autre longue phrase 2026' }),
    ],
    ['POST', '/api/v1/account/pin', (pw: string) => ({ pin: '1234', password: pw })],
    ['POST', '/api/v1/account/delete', (pw: string) => ({ password: pw })],
    ['DELETE', '/api/v1/profiles/:kid', (pw: string) => ({ password: pw })],
  ] as const)('SEC-6 : %s %s — verrou après 10 mots de passe faux', async (method, url, body) => {
    const email = `sec6-${Math.random().toString(36).slice(2)}@exemple.org`;
    const { P } = await parent(c, email);
    const kid = await child(c, P, 'Sec');
    const u = url.replace(':kid', kid);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++)
      codes.push((await c.req(method, u, P, body('faux mot de passe'))).statusCode);
    expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    // le bon mot de passe reste refusé tant que le verrou tient
    const ok = await c.req(method, u, P, body(PW));
    expect(ok.statusCode).toBe(429);
  });

  it('SEC-8 : un événement volumineux (1 Mo de JSON libre) est refusé seul ; les détails sont bornés', async () => {
    const { A, profileId } = await adult(c, 'sec8@exemple.org');
    const day = new Date().toISOString().slice(0, 10);
    const deviceAt = new Date().toISOString();
    const gros = {
      id: randomUUID(),
      profileId,
      unitId: 'en1.l01',
      eventType: 'checklist',
      response: { checked: 1, total: 2, bourrage: 'x'.repeat(200_000) },
      deviceAt,
    };
    const details = {
      id: randomUUID(),
      profileId,
      unitId: 'x',
      eventType: 'trace',
      response: { item: 'ب', ok: true, day, details: { note: 'y'.repeat(3000) } },
      deviceAt,
    };
    const bon = {
      id: randomUUID(),
      profileId,
      unitId: 'x',
      eventType: 'trace',
      response: { item: 'ب', ok: true, day, details: { note: 'court' } },
      deviceAt,
    };
    const r = await c.req('POST', '/api/v1/attempts', A, { events: [gros, details, bon] });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200);
    const ko = r.json().rejected.map((x: { id: string }) => x.id);
    expect(ko).toContain(gros.id);
    expect(ko).toContain(details.id);
    expect(r.json().accepted.map((x: { id: string }) => x.id)).toEqual([bon.id]);
  });
});
