/**
 * Lot 9 — rapport de charge et de sécurité du 14/10 : R5 (limite globale des lectures, par compte connecté ou par
 * adresse) et R6 (échecs de connexion comptés par couple compte + adresse : une classe derrière une même adresse
 * n'est pas bloquée par les erreurs de ses élèves).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  cleAdresse,
  LIMITE_DEFAUT,
  limiteDepuis,
  registerLimiteLectures,
  Seaux,
} from '../src/limite-lectures.js';
import { ECHECS_CONNEXION_ADRESSE } from '../src/auth/common.js';
import { adult, PW, setupEdition, type Ctx } from './helpers.js';

describe('R5 — limite des lectures (sans base)', () => {
  it('réglage : défaut 60/300, « off » la coupe, valeur illisible = défaut', () => {
    expect(limiteDepuis(undefined)).toEqual(LIMITE_DEFAUT);
    expect(LIMITE_DEFAUT).toEqual({ debit: 60, rafale: 300 });
    expect(limiteDepuis('off')).toBeNull();
    expect(limiteDepuis('0')).toBeNull();
    expect(limiteDepuis('20/50')).toEqual({ debit: 20, rafale: 50 });
    expect(limiteDepuis('10')).toEqual({ debit: 10, rafale: 50 });
    expect(limiteDepuis('beaucoup')).toEqual(LIMITE_DEFAUT);
  });

  it('IPv6 ramenée au /64, IPv4 telle quelle', () => {
    expect(cleAdresse('203.0.113.7')).toBe('203.0.113.7');
    expect(cleAdresse('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(cleAdresse('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(cleAdresse('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(cleAdresse('2001:db8::1')).toBe('2001:db8:0:0::/64');
  });

  it('seau : rafale puis débit soutenu ; délai d’attente annoncé ; mémoire bornée', () => {
    let t = 0;
    const s = new Seaux({ debit: 10, rafale: 20 }, () => t, 3);
    for (let i = 0; i < 20; i++) expect(s.prendre('x')).toBe(0);
    expect(s.prendre('x')).toBe(100); // un jeton revient en 100 ms
    t += 100;
    expect(s.prendre('x')).toBe(0);
    expect(s.prendre('x')).toBeGreaterThan(0);
    // autres clés indépendantes
    expect(s.prendre('y')).toBe(0);
    expect(s.prendre('z')).toBe(0);
    expect(s.prendre('w')).toBe(0); // la plus ancienne clé part : jamais plus de 3
    expect(s.taille).toBe(3);
    t += 10_000;
    s.nettoyer();
    expect(s.taille).toBe(0);
  });

  it('route : 429 + Retry-After au-delà de la rafale, par adresse pour un anonyme, par compte sinon ; écritures et santé non comptées', async () => {
    let t = 0;
    const app = Fastify();
    // session simulée : en-tête x-compte (la vraie session est lue par registerAuth avant)
    app.decorateRequest('auth', null);
    app.addHook('onRequest', async (req) => {
      const c = req.headers['x-compte'];
      (req as unknown as { auth: unknown }).auth = typeof c === 'string' ? { accountId: c } : null;
    });
    registerLimiteLectures(app, { limite: { debit: 1, rafale: 3 }, maintenant: () => t });
    app.get('/api/v1/levels', async () => ({ ok: true }));
    app.get('/api/v1/health', async () => ({ ok: true }));
    app.post('/api/v1/x', async () => ({ ok: true }));
    await app.ready();
    const get = (url: string, compte?: string, ip = '198.51.100.1') =>
      app.inject({
        method: 'GET',
        url,
        remoteAddress: ip,
        headers: compte ? { 'x-compte': compte } : {},
      });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await get('/api/v1/levels')).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const r = await get('/api/v1/levels');
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ error: { code: 'trop_de_requetes' } });
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    // même adresse, mais élèves CONNECTÉS : chacun son seau (une classe derrière une adresse n'est pas bloquée)
    for (const eleve of ['e1', 'e2', 'e3'])
      for (let i = 0; i < 3; i++) expect((await get('/api/v1/levels', eleve)).statusCode).toBe(200);
    expect((await get('/api/v1/levels', 'e1')).statusCode).toBe(429);
    // autre adresse anonyme : indépendante
    expect((await get('/api/v1/levels', undefined, '198.51.100.2')).statusCode).toBe(200);
    // santé et écritures : jamais limitées par ce seau
    expect((await get('/api/v1/health')).statusCode).toBe(200);
    const p = await app.inject({
      method: 'POST',
      url: '/api/v1/x',
      remoteAddress: '198.51.100.1',
      payload: {},
    });
    expect(p.statusCode).toBe(200);
    // le temps rend des jetons
    t += 2000;
    expect((await get('/api/v1/levels')).statusCode).toBe(200);
    await app.close();
  });

  it('derrière Caddy : les appels internes du serveur web (sans X-Forwarded-For) ne sont pas comptés', async () => {
    const app = Fastify();
    app.decorateRequest('auth', null);
    registerLimiteLectures(app, {
      limite: { debit: 1, rafale: 2 },
      maintenant: () => 0,
      mandataire: true,
    });
    app.get('/api/v1/acces/statut', async () => ({ ok: true }));
    for (let i = 0; i < 10; i++)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/acces/statut',
            remoteAddress: '172.18.0.5',
          })
        ).statusCode,
      ).toBe(200);
    const visiteur = () =>
      app.inject({
        method: 'GET',
        url: '/api/v1/acces/statut',
        remoteAddress: '172.18.0.2',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
    expect((await visiteur()).statusCode).toBe(200);
    expect((await visiteur()).statusCode).toBe(200);
    expect((await visiteur()).statusCode).toBe(429);
    await app.close();
  });

  it('coupée (« off ») : aucune limite', async () => {
    const app = Fastify();
    expect(registerLimiteLectures(app, { limite: null })).toBeNull();
    app.get('/api/v1/levels', async () => ({ ok: true }));
    for (let i = 0; i < 50; i++)
      expect((await app.inject({ method: 'GET', url: '/api/v1/levels' })).statusCode).toBe(200);
    await app.close();
  });
});

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('R6 — échecs de connexion par compte + adresse', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const login = (email: string, password: string, ip: string) =>
    c.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: ip,
      headers: { 'x-awform': '1' },
      payload: { email, password },
    });

  it('seuil de l’adresse seule relevé (300 par défaut)', () => {
    expect(ECHECS_CONNEXION_ADRESSE).toBe(300);
  });

  it('une classe derrière une même adresse : 8 élèves × 5 erreurs (40 > 30, l’ancien seuil) ne bloquent pas les autres', async () => {
    const ip = '192.0.2.40';
    const eleves = await Promise.all(
      Array.from({ length: 9 }, async (_, i) => {
        const email = `r6-${i}-${Math.random().toString(36).slice(2)}@exemple.org`;
        await adult(c, email);
        return email;
      }),
    );
    // V2-1 : 8 essais, le 8e déclenche la pause (429) ; les 7 premiers répondent 401
    for (const e of eleves.slice(0, 8))
      for (let k = 0; k < 8; k++)
        expect((await login(e, 'mauvais mot de passe', ip)).statusCode).toBe(k < 7 ? 401 : 429);
    // le 9e élève, sans erreur, se connecte depuis la même adresse
    expect((await login(eleves[8]!, PW, ip)).statusCode).toBe(200);
    // un élève qui s'est trompé 8 fois est verrouillé POUR LUI, sur cette adresse seulement
    const v = await login(eleves[0]!, PW, ip);
    expect(v.statusCode).toBe(429);
    expect(v.json().error.code).toBe('verrouille');
    // … et peut se connecter d'une autre adresse (personne ne verrouille le compte d'autrui à distance)
    expect((await login(eleves[0]!, PW, '192.0.2.41')).statusCode).toBe(200);
  });
});
