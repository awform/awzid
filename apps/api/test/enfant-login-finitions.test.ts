/**
 * V2-3 — finitions de la relecture de sécurité : M3 (le parent RETIRE l'identifiant d'un enfant) et M4 (plafond
 * GLOBAL de 30 échecs par heure et par identifiant, toutes adresses confondues, puis 1 h de pause).
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { emailKey } from '../src/auth/common.js';
import { ECHECS_PAR_IDENTIFIANT, cleGlobaleIdentifiant } from '../src/auth/service.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const PW_ENFANT = 'soleil-vert-42';
const YEAR = new Date().getUTCFullYear();

describe.skipIf(!URL)('finitions de sécurité des comptes enfants (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  const H = { 'x-awform': '1' };
  const cookieOf = (r: LightMyRequestResponse) =>
    String(
      (Array.isArray(r.headers['set-cookie'])
        ? r.headers['set-cookie'][0]
        : r.headers['set-cookie']) ?? '',
    ).split(';')[0] ?? '';
  const appel = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    cookie = '',
    payload?: object,
    extra: Record<string, string> = {},
    ip?: string,
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: { ...H, ...extra, ...(cookie ? { cookie } : {}) },
      ...(ip ? { remoteAddress: ip } : {}),
    });
  const parent = async (email: string) => {
    const r = await appel('POST', '/api/v1/auth/signup', '', {
      kind: 'parent',
      email,
      password: PW,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    });
    expect(r.statusCode).toBe(201);
    return cookieOf(r);
  };
  const creerEnfant = async (cookie: string, identifiant: string, pseudonym: string) => {
    const r = await appel('POST', '/api/v1/profiles', cookie, {
      pseudonym,
      birthYear: YEAR - 9,
      identifiant,
      motDePasseEnfant: PW_ENFANT,
      declaration: true,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
      password: PW,
    });
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  };
  const connexion = (identifiant: string, ip: string, mdp = PW_ENFANT) =>
    appel('POST', '/api/v1/auth/login', '', { email: identifiant, password: mdp }, {}, ip);

  let cookieParent = '';
  let idLina = '';
  let idOmar = '';

  beforeAll(async () => {
    h = connect(URL!, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'enfant-login-finitions', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    cookieParent = await parent('finitions.parent@exemple.org');
    idLina = await creerEnfant(cookieParent, 'lina-482', 'Lina');
    idOmar = await creerEnfant(cookieParent, 'omar-316', 'Omar');
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('M3 : retirer l’identifiant exige la ressaisie ; un étranger au profil reçoit 404', async () => {
    const url = `/api/v1/profiles/${idLina}/acces`;
    const sans = await appel('DELETE', url, cookieParent, {});
    expect(sans.statusCode).toBe(400);
    expect(sans.json().error.code).toBe('mot_de_passe_requis');
    const faux = await appel('DELETE', url, cookieParent, {
      password: 'un mauvais mot de passe 2026',
    });
    expect(faux.statusCode).toBe(401);
    const autre = await parent('finitions.autre@exemple.org');
    expect((await appel('DELETE', url, autre, { password: PW })).statusCode).toBe(404);
    // un enfant (session limitée) n'a aucune prise
    const cookieEnfant = cookieOf(await connexion('lina-482', '10.1.0.1'));
    expect((await appel('DELETE', url, cookieEnfant, { password: PW })).statusCode).toBe(403);
    const encore = await h.db
      .select()
      .from(t.profileLogin)
      .where(eq(t.profileLogin.profileId, idLina));
    expect(encore).toHaveLength(1);
  });

  it('M3 : le parent retire l’identifiant : ligne supprimée, sessions de l’enfant fermées, frère et profil intacts', async () => {
    const cookieLina = cookieOf(await connexion('lina-482', '10.1.0.2'));
    const cookieOmar = cookieOf(await connexion('omar-316', '10.1.0.3'));
    expect((await appel('GET', '/api/v1/auth/me', cookieLina)).statusCode).toBe(200);
    const r = await appel('DELETE', `/api/v1/profiles/${idLina}/acces`, cookieParent, {
      password: PW,
    });
    expect(r.statusCode).toBe(200);
    expect(
      await h.db.select().from(t.profileLogin).where(eq(t.profileLogin.profileId, idLina)),
    ).toHaveLength(0);
    expect((await appel('GET', '/api/v1/auth/me', cookieLina)).statusCode).toBe(401);
    expect((await connexion('lina-482', '10.1.0.4')).statusCode).toBe(401);
    // le frère garde son accès et sa session ; le profil de Lina existe toujours
    expect((await appel('GET', '/api/v1/auth/me', cookieOmar)).statusCode).toBe(200);
    expect((await connexion('omar-316', '10.1.0.5')).statusCode).toBe(200);
    expect((await appel('GET', `/api/v1/profiles/${idLina}/acces`, cookieParent)).json()).toEqual({
      identifiant: null,
    });
    // rien à retirer une seconde fois
    expect(
      (await appel('DELETE', `/api/v1/profiles/${idLina}/acces`, cookieParent, { password: PW }))
        .statusCode,
    ).toBe(404);
    expect(
      (await h.db.select().from(t.auditLog).where(eq(t.auditLog.action, 'profil.acces_retire')))
        .length,
    ).toBe(1);
    // l'identifiant libéré peut être redonné
    const redonne = await appel('POST', `/api/v1/profiles/${idLina}/acces`, cookieParent, {
      identifiant: 'lina-482',
      motDePasse: PW_ENFANT,
      declaration: true,
      password: PW,
    });
    expect(redonne.statusCode).toBe(201);
  });

  it('M3 : le code parent remplace le mot de passe pour le retrait', async () => {
    expect(
      (await appel('POST', '/api/v1/account/pin', cookieParent, { pin: '4821', password: PW }))
        .statusCode,
    ).toBe(200);
    const url = `/api/v1/profiles/${idOmar}/acces`;
    expect(
      (await appel('DELETE', url, cookieParent, {}, { 'x-parent-pin': '0000' })).statusCode,
    ).toBe(401);
    expect(
      (await appel('DELETE', url, cookieParent, {}, { 'x-parent-pin': '4821' })).statusCode,
    ).toBe(200);
    await creerAccesOmar();
  });
  async function creerAccesOmar() {
    const r = await appel(
      'POST',
      `/api/v1/profiles/${idOmar}/acces`,
      cookieParent,
      { identifiant: 'omar-316', motDePasse: PW_ENFANT, declaration: true },
      { 'x-parent-pin': '4821' },
    );
    expect(r.statusCode).toBe(201);
  }

  it('M4 : 30 échecs en une heure depuis 30 adresses différentes verrouillent l’identifiant ; le parent remet à zéro', async () => {
    const idSami = await creerEnfant(cookieParent, 'sami-222', 'Sami');
    for (let i = 0; i < ECHECS_PAR_IDENTIFIANT; i++) {
      const r = await connexion('sami-222', `10.2.0.${i + 1}`, `mauvais-${i}-mot-2026`);
      expect(r.statusCode, `essai ${i + 1}`).toBe(401);
    }
    // adresse jamais vue, BON mot de passe : refusé tant que le plafond est atteint
    const bloque = await connexion('sami-222', '10.2.1.1');
    expect(bloque.statusCode).toBe(429);
    expect(bloque.json().error.code).toBe('verrouille');
    expect(bloque.json().error.pause_minutes).toBe(60);
    const [ligne] = await h.db
      .select()
      .from(t.authThrottle)
      .where(eq(t.authThrottle.key, cleGlobaleIdentifiant(emailKey('sami-222'))));
    const duree = ligne!.lockedUntil!.getTime() - Date.now();
    expect(duree).toBeGreaterThan(59 * 60_000);
    expect(duree).toBeLessThanOrEqual(60 * 60_000);
    // le parent débloque : compteur global à zéro, connexion de nouveau possible
    const deb = await appel('POST', `/api/v1/profiles/${idSami}/acces`, cookieParent, {
      debloquer: true,
      password: PW,
    });
    expect(deb.statusCode).toBe(200);
    expect(
      await h.db
        .select()
        .from(t.authThrottle)
        .where(eq(t.authThrottle.key, cleGlobaleIdentifiant(emailKey('sami-222')))),
    ).toHaveLength(0);
    expect((await connexion('sami-222', '10.2.1.2')).statusCode).toBe(200);
  });

  it('M4 : réponse identique que l’identifiant existe ou non', async () => {
    const reponses: Array<{ status: number; erreur: Record<string, unknown> }> = [];
    for (const login of ['omar-316', 'fantome-999']) {
      for (let i = 0; i < ECHECS_PAR_IDENTIFIANT; i++)
        await connexion(login, `10.3.0.${i + 1}`, `mauvais-${i}-mot-2026`);
      const r = await connexion(login, '10.3.1.1');
      reponses.push({ status: r.statusCode, erreur: r.json().error });
    }
    expect(reponses[0]!.status).toBe(429);
    expect(reponses[1]!.status).toBe(429);
    expect(Object.keys(reponses[0]!.erreur).sort()).toEqual(
      Object.keys(reponses[1]!.erreur).sort(),
    );
    expect(reponses[0]!.erreur.code).toBe(reponses[1]!.erreur.code);
    expect(reponses[0]!.erreur.pause_minutes).toBe(reponses[1]!.erreur.pause_minutes);
  });

  it('M4 : le plafond ne vise que les identifiants d’enfant (jamais une adresse e-mail)', async () => {
    for (let i = 0; i < ECHECS_PAR_IDENTIFIANT + 2; i++) {
      const r = await connexion(
        'finitions.parent@exemple.org',
        `10.4.0.${i + 1}`,
        `mauvais-${i}-mot-2026`,
      );
      expect(r.statusCode).toBe(401);
    }
    expect((await connexion('finitions.parent@exemple.org', '10.4.1.1', PW)).statusCode).toBe(200);
  });
});
