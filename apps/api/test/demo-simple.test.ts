/**
 * Démonstration — connexion simplifiée (demande du client, réseau local seulement) : identifiants courts
 * `parent`, `enfant`, `ado`, `adulte`, `enseignant`, `admin` et mot de passe court, sans second facteur.
 * Preuve que ces assouplissements sont IMPOSSIBLES en production (option absente) et que l'API refuse de
 * démarrer en démonstration sur une configuration publique.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t } from '@awform/db';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { demoGuard } from '../src/demo-mode.js';
import {
  adult,
  child,
  cookieOf,
  parent,
  PW,
  setup,
  teacherWithSecret,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const D = 'essai@demo.awform.test';
const IDS = ['parent', 'enfant', 'ado', 'adulte', 'enseignant', 'admin'] as const;

describe('garde-fou de démarrage (AWFORM_DEMO=1)', () => {
  const lan = {
    AWFORM_DEMO: '1',
    SITE: '192.168.50.10',
    SITE_LAN: '192.168.1.106',
    COOKIE_SECURE: 'auto',
  };
  it('réseau local : accepté ; sans AWFORM_DEMO : sans objet', () => {
    expect(demoGuard(lan)).toBeNull();
    expect(demoGuard({ ...lan, SITE: 'localhost', SITE_LAN: 'awzid.test' })).toBeNull();
    expect(demoGuard({ SITE: 'awzid.com', COOKIE_SECURE: '1' })).toBeNull();
  });
  it('domaine ou adresse publics, relais public, mode production, SITE absent : refusé', () => {
    expect(demoGuard({ ...lan, SITE: 'awzid.com' })).toMatch(/publique/);
    expect(demoGuard({ ...lan, SITE_LAN: '82.64.10.1' })).toMatch(/publique/);
    expect(demoGuard({ ...lan, RELAIS_DOMAINE: 'ecoles.awzid.com' })).toMatch(/relais/);
    expect(demoGuard({ ...lan, COOKIE_SECURE: '1' })).toMatch(/production/);
    expect(demoGuard({ ...lan, SITE: '' })).toMatch(/SITE absent/);
  });
  it('server.ts applique le garde-fou ; l’API n’a aucun port publié ; deploy --demo pose AWFORM_DEMO=1', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const server = readFileSync(join(root, 'apps/api/src/server.ts'), 'utf8');
    expect(server).toMatch(/demoGuard\(process\.env\)[\s\S]*process\.exit\(1\)/);
    const y = readFileSync(join(root, 'infra/prod/compose.yml'), 'utf8');
    const api = y.slice(y.indexOf('\n  api:'), y.indexOf('\n  worker:'));
    expect(api).not.toMatch(/\n {4}ports:/);
    expect(readFileSync(join(root, 'infra/prod/demo-env.sh'), 'utf8')).toContain('AWFORM_DEMO=1');
  });
});

describe.skipIf(!URL_)('connexion simplifiée de la démonstration (awform_test)', () => {
  let c: Ctx;
  let demo: FastifyInstance;
  let secret = '';
  const login = (app: FastifyInstance, body: object) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: body,
      headers: { 'x-awform': '1' },
    });

  beforeAll(async () => {
    // c.app : PRODUCTION (aucune option de démonstration) ; demo : même base, connexion simplifiée
    c = await setup(URL_!);
    const { P } = await parent(c, `parent-${D}`);
    await child(c, P, 'Lina', 7);
    await child(c, P, 'Bilal', 10);
    await child(c, P, 'Yanis', 15);
    await adult(c, `adulte-${D}`);
    secret = (await teacherWithSecret(c, `enseignant-${D}`)).secret;
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: `admin-${D}`,
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    demo = buildApp({
      db: c.h.db,
      secretKey: randomBytes(32),
      relaisCertsDir: null,
      demoLogin: true,
    });
    await demo.ready();
  }, 60_000);
  afterAll(async () => {
    await demo?.close();
    await c?.app.close();
    await c?.h.close();
  });

  it('PRODUCTION : identifiant court refusé, mot de passe court refusé, second facteur exigé', async () => {
    for (const id of IDS)
      expect((await login(c.app, { email: id, password: 'awzid' })).statusCode).toBe(401);
    expect((await login(c.app, { email: `parent-${D}`, password: 'awzid' })).statusCode).toBe(401);
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'court@exemple.test',
        password: 'awzid',
        country: 'FR',
        consents: ['cgu'],
        birthYear: 1990,
      },
    );
    expect(su.statusCode).toBe(400);
    const tch = await login(c.app, { email: `enseignant-${D}`, password: PW });
    expect(tch.statusCode).toBe(401);
    expect(tch.json().error.code).toBe('totp_requis');
    const cfg = await c.app.inject({ method: 'GET', url: '/api/v1/config' });
    expect(cfg.json().demo).toBe(false);
    // le code reste exigé : un code valide passe
    const ok = await login(c.app, {
      email: `enseignant-${D}`,
      password: PW,
      totp: totpAt(secret, Math.floor(Date.now() / 30_000) + 1),
    });
    expect(ok.statusCode).toBe(200);
  });

  it('DÉMONSTRATION : les six identifiants, mot de passe « awzid », sans code à 6 chiffres', async () => {
    expect((await demo.inject({ method: 'GET', url: '/api/v1/config' })).json().demo).toBe(true);
    const seen: Record<string, { kind: string; profil: string | null; pseudos: string[] }> = {};
    for (const id of IDS) {
      const r = await login(demo, { email: id, password: 'awzid' });
      expect(r.statusCode, id).toBe(200);
      const b = r.json();
      expect(b.mfaVerified).toBe(true);
      const profil =
        b.profiles.find((p: { id: string }) => p.id === b.profilDemo)?.pseudonym ?? null;
      seen[id] = {
        kind: b.account.kind,
        profil,
        pseudos: b.profiles.map((p: { pseudonym: string }) => p.pseudonym),
      };
      // la session ouvre les espaces protégés (second facteur considéré comme vérifié)
      if (id === 'enseignant') {
        const cl = await demo.inject({
          method: 'GET',
          url: '/api/v1/teacher/classes',
          headers: { cookie: cookieOf(r) },
        });
        expect(cl.statusCode).toBe(200);
      }
    }
    expect(seen.parent).toMatchObject({
      kind: 'parent',
      profil: null,
      pseudos: ['Lina', 'Bilal', 'Yanis'],
    });
    expect(seen.enfant).toMatchObject({ kind: 'parent', profil: 'Lina' });
    expect(seen.ado).toMatchObject({ kind: 'parent', profil: 'Yanis' });
    expect(seen.adulte!.kind).toBe('adulte');
    expect(seen.enseignant!.kind).toBe('enseignant');
    expect(seen.admin!.kind).toBe('admin');
    // mauvais mot de passe ou identifiant inconnu : refusés ; e-mail + vrai mot de passe : inchangé
    expect((await login(demo, { email: 'parent', password: 'awzid2' })).statusCode).toBe(401);
    expect((await login(demo, { email: 'eleve', password: 'awzid' })).statusCode).toBe(401);
    expect((await login(demo, { email: `parent-${D}`, password: PW })).statusCode).toBe(200);
  });
});
