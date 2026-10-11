/**
 * Lot 17 — relais d'école, côté serveur central : enregistrement (jeton haché), battement, révocation,
 * certificat du sous-domaine remis au seul relais authentifié, autorisation TLS « à la demande »,
 * récitation relayée sans doublon (clé d'idempotence).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  connect,
  createRelay,
  listRelays,
  parseRecitationKey,
  resetTestDatabase,
  revokeRelay,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { findCaddyCert } from '../src/relais.js';
import { COUNTRY_CODE, countryRules, DIGITAL_CONSENT_AGE, EU_EEA } from '../src/auth/policy.js';

describe('consentement par pays (sans base)', () => {
  it('Sénégal : loi 2008-12, CDP, accord exprès au transfert, mineurs par un parent', () => {
    expect(countryRules('sn')).toMatchObject({
      country: 'SN',
      law: 'sn_2008_12',
      authority: 'cdp_sn',
      consentAge: 18,
      transferConsent: true,
      accountConsents: ['cgu', 'donnee_religieuse_art9', 'transfert_hors_pays'],
      aValider: true,
    });
  });
  it('France : RGPD, CNIL, 15 ans, pas de transfert ; États-Unis : COPPA sous 13 ans', () => {
    expect(countryRules('FR')).toMatchObject({
      law: 'rgpd',
      authority: 'cnil',
      consentAge: 15,
      transferConsent: false,
      accountConsents: ['cgu', 'donnee_religieuse_art9'],
    });
    const us = countryRules('US');
    expect(us).toMatchObject({ law: 'coppa', authority: 'ftc_us', transferConsent: true });
    // lot F3 (revue G3) : moins de 13 ans FERMÉS au lancement (plus de consentement COPPA recueilli)
    expect(us.closedUnder).toBe(13);
    expect(us.childConsents.moins13).not.toContain('coppa_parent');
  });
  it('pays sans entrée : RGPD dans l’UE, mention générique ailleurs ; jamais d’autorité inventée', () => {
    expect(countryRules('DE')).toMatchObject({ law: 'rgpd', authority: 'autorite_ue' });
    expect(countryRules('GN')).toMatchObject({
      law: 'generique',
      authority: 'autorite_locale',
      transferConsent: true,
    });
    for (const c of [...Object.keys(DIGITAL_CONSENT_AGE), ...EU_EEA]) {
      const r = countryRules(c);
      // hors UE/EEE, Suisse et Royaume-Uni : accord exprès au transfert, toujours
      expect(r.transferConsent).toBe(!EU_EEA.has(c) && c !== 'CH' && c !== 'GB');
    }
    expect(COUNTRY_CODE.test('SN')).toBe(true);
    expect(COUNTRY_CODE.test('S1')).toBe(false);
  });
});

const URL_ = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';
const AUDIO = Buffer.concat([Buffer.from('OggS'), randomBytes(2000)]);

/** Stockage Caddy factice : certificates/<émetteur>/<nom>/<nom>.crt|.key */
function fakeCaddy(host: string) {
  const dir = mkdtempSync(join(tmpdir(), 'caddy-'));
  const d = join(dir, 'certificates', 'acme-v02.api.letsencrypt.org-directory', host);
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, `${host}.crt`),
    '-----BEGIN CERTIFICATE-----\nFAUX\n-----END CERTIFICATE-----\n',
  );
  writeFileSync(
    join(d, `${host}.key`),
    '-----BEGIN PRIVATE KEY-----\nFAUX\n-----END PRIVATE KEY-----\n',
  );
  return dir;
}

describe.skipIf(!URL_)('lot 17 (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const HOST = 'ecole-diallo.relais.exemple.org';
  let token = '';
  const certs = fakeCaddy(HOST);
  const req = (
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string> = {},
    payload?: object | Buffer,
  ) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...headers },
    });

  beforeAll(async () => {
    h = connect(URL_, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await h.pool.query(
      "insert into level (code, track, rank, title_fr) values ('en1', 'enfants', 1, 'Niveau 1')",
    );
    app = buildApp({
      db: h.db,
      secretKey: randomBytes(32),
      recitationKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
      relaisCertsDir: certs,
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('enregistrement : jeton montré une fois, seul son hachage est gardé ; nom contrôlé', async () => {
    const r = await createRelay(h.db, 'École Diallo', HOST);
    token = r.token;
    expect(token).toMatch(/^rel_/);
    const [row] = await h.db.select().from(t.relay).where(eq(t.relay.host, HOST));
    expect(JSON.stringify(row)).not.toContain(token);
    await expect(createRelay(h.db, 'x', 'pas un nom')).rejects.toThrow(/invalide/);
    await expect(createRelay(h.db, 'x', HOST)).rejects.toThrow();
  });

  it('battement : jeton exigé ; l’état remonte au central', async () => {
    expect((await req('POST', '/api/v1/relais/battement', {}, {})).statusCode).toBe(401);
    expect(
      (await req('POST', '/api/v1/relais/battement', { 'x-relais-jeton': 'rel_faux' }, {}))
        .statusCode,
    ).toBe(401);
    const ok = await req(
      'POST',
      '/api/v1/relais/battement',
      { 'x-relais-jeton': token },
      { enAttente: 3, refuses: 0, version: '17' },
    );
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().host).toBe(HOST);
    const [l] = await listRelays(h.db);
    expect(l!.lastSeenAt).not.toBeNull();
    expect(l!.lastReport).toMatchObject({ enAttente: 3, version: '17' });
  });

  it('certificat HTTPS de l’école : remis au seul relais authentifié', async () => {
    expect((await req('GET', '/api/v1/relais/certificat')).statusCode).toBe(401);
    const c = await req('GET', '/api/v1/relais/certificat', { 'x-relais-jeton': token });
    expect(c.statusCode).toBe(200);
    expect(c.headers['cache-control']).toBe('no-store');
    expect(c.json()).toMatchObject({ host: HOST });
    expect(c.json().key).toContain('PRIVATE KEY');
    expect(findCaddyCert(certs, 'autre.relais.exemple.org')).toBeNull();
  });

  it('TLS à la demande : seulement pour un relais enregistré et actif', async () => {
    expect(
      (await req('GET', `/api/v1/relais/tls-autorise?domain=${HOST.toUpperCase()}`)).statusCode,
    ).toBe(200);
    expect(
      (await req('GET', '/api/v1/relais/tls-autorise?domain=inconnu.relais.exemple.org'))
        .statusCode,
    ).toBe(404);
    expect((await req('GET', '/api/v1/relais/tls-autorise')).statusCode).toBe(404);
  });

  it('révocation : jeton refusé, plus de certificat ni de TLS', async () => {
    expect(await revokeRelay(h.db, HOST)).toBe(true);
    expect(await revokeRelay(h.db, HOST)).toBe(false);
    expect(
      (await req('GET', '/api/v1/relais/certificat', { 'x-relais-jeton': token })).statusCode,
    ).toBe(401);
    expect(
      (await req('POST', '/api/v1/relais/battement', { 'x-relais-jeton': token }, {})).statusCode,
    ).toBe(401);
    expect((await req('GET', `/api/v1/relais/tls-autorise?domain=${HOST}`)).statusCode).toBe(404);
  });

  it('règles du pays (public) ; la preuve de l’accord garde la loi et l’autorité', async () => {
    const r = await req('GET', '/api/v1/pays/SN/regles');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ law: 'sn_2008_12', authority: 'cdp_sn' });
    expect((await req('GET', '/api/v1/pays/SEN/regles')).statusCode).toBe(400);
    // Sénégal : sans l'accord exprès au transfert, pas de compte
    const base = {
      kind: 'parent',
      birthYear: 1985,
      email: 'sn17@exemple.org',
      password: PW,
      country: 'SN',
    };
    const no = await req(
      'POST',
      '/api/v1/auth/signup',
      {},
      { ...base, consents: ['cgu', 'donnee_religieuse_art9'] },
    );
    expect(no.statusCode).toBe(400);
    expect(no.json().error).toMatchObject({
      code: 'consentement_requis',
      missing: ['transfert_hors_pays'],
    });
    const ok = await req(
      'POST',
      '/api/v1/auth/signup',
      {},
      { ...base, consents: ['cgu', 'donnee_religieuse_art9', 'transfert_hors_pays'] },
    );
    expect(ok.statusCode, ok.body).toBe(201);
    const rows = await h.db.select().from(t.consent).where(eq(t.consent.country, 'SN'));
    expect(rows.map((c) => c.type).sort()).toEqual([
      'cgu',
      'donnee_religieuse_art9',
      'transfert_hors_pays',
    ]);
    for (const c of rows)
      expect(c.evidence).toEqual({ loi: 'sn_2008_12', autorite: 'cdp_sn', majoriteDeclaree: true });
  });

  it('récitation relayée deux fois (accusé perdu) : enregistrée une seule fois', async () => {
    const su = await req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        email: 'p17@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    );
    expect(su.statusCode, su.body).toBe(201);
    const parent = cookieOf(su);
    const P = { cookie: parent };
    const pr = await req('POST', '/api/v1/profiles', P, {
      pseudonym: 'Awa',
      birthYear: YEAR - 10,
      levelCode: 'en1',
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    expect(pr.statusCode, pr.body).toBe(201);
    const child = pr.json().id;
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: 'maitre17@ecole.example',
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    const tc = cookieOf(
      await req(
        'POST',
        '/api/v1/auth/login',
        {},
        { email: 'maitre17@ecole.example', password: PW },
      ),
    );
    const s = (await req('POST', '/api/v1/auth/totp/setup', { cookie: tc }, {})).json();
    await req(
      'POST',
      '/api/v1/auth/totp/confirm',
      { cookie: tc },
      {
        code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
      },
    );
    const cls = (
      await req('POST', '/api/v1/teacher/classes', { cookie: tc }, { name: 'Classe 17' })
    ).json().class;
    await req('POST', `/api/v1/profiles/${child}/classes`, P, {
      code: cls.joinCode,
      consent: true,
    });
    await req('POST', '/api/v1/account/pin', P, { pin: '4821', password: PW });
    const pin = { ...P, 'x-parent-pin': '4821' };
    await req('POST', `/api/v1/profiles/${child}/recitations/accord`, pin, {});
    const url = `/api/v1/profiles/${child}/recitations?classe=${cls.id}&passage=112:1-4`;
    const H = { ...pin, 'content-type': 'audio/ogg', 'idempotency-key': 'relais-cle-essai-17' };
    const a = await req('POST', url, H, AUDIO);
    expect(a.statusCode, a.body).toBe(201);
    const b = await req('POST', url, H, AUDIO);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toMatchObject({ doublon: true, recitation: { id: a.json().recitation.id } });
    expect(await h.db.select().from(t.recitationUpload)).toHaveLength(1);
    // même clé pour un AUTRE profil : envoi distinct (la clé ne révèle ni ne bloque rien d'autrui)
    const frere = (
      await req('POST', '/api/v1/profiles', P, {
        pseudonym: 'Moussa',
        birthYear: YEAR - 11,
        levelCode: 'en1',
        password: PW,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      })
    ).json().id;
    await req(
      'POST',
      `/api/v1/profiles/${frere}/classes`,
      { ...P, 'x-parent-pin': '4821' },
      {
        code: cls.joinCode,
        consent: true,
      },
    );
    await req('POST', `/api/v1/profiles/${frere}/recitations/accord`, pin, {});
    const c2 = await req('POST', url.replace(child, frere), H, AUDIO);
    expect(c2.statusCode, c2.body).toBe(201);
    expect(c2.json().recitation.id).not.toBe(a.json().recitation.id);
    // clé invalide : ignorée (envoi ordinaire, sans déduplication)
    expect((await req('POST', url, { ...H, 'idempotency-key': 'court' }, AUDIO)).statusCode).toBe(
      201,
    );
    expect(await h.db.select().from(t.recitationUpload)).toHaveLength(3);
  });
});
