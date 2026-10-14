/**
 * Lot 6 — groupe « bêta fermée » (API, base de test) :
 *  - une invitation peut attribuer le groupe (rôle `beta_fermee`) au compte qui s'inscrit avec ;
 *  - l'administrateur (second facteur) ajoute ou retire un compte par son adresse ; chaque changement est journalisé ;
 *  - `GET /auth/me` dit si le compte voit le contenu différé (`betaDiffere`) : rôle ET interrupteur
 *    `beta_contenu_differe_visible` ; le retrait du groupe coupe le droit à la requête suivante ;
 *  - un compte ordinaire, un visiteur et un parent n'ont ni le groupe ni l'accès à l'administration du groupe.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schema as t, setFlagState } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { memoryMailer } from '../src/mail/envoi.js';
import { cookieOf, parent, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe.skipIf(!URL)(
  'Groupe « bêta fermée » : invitation, administration, droit (awform_test)',
  () => {
    let c: Ctx;
    let A: H;
    const mail = memoryMailer();
    let n = 0;
    const addr = (p = 'gb') => `${p}${++n}@exemple.org`;

    const signup = (email: string, invitation?: string) =>
      c.req(
        'POST',
        '/api/v1/auth/signup',
        {},
        {
          kind: 'adulte',
          email,
          password: PW,
          country: 'FR',
          consents: ['cgu', 'donnee_religieuse_art9'],
          birthYear: YEAR - 30,
          pseudonym: 'Moi',
          ...(invitation ? { invitation } : {}),
        },
      );
    const me = async (cookie: string) =>
      (await c.req('GET', '/api/v1/auth/me', { cookie })).json() as {
        roles: string[];
        betaDiffere: boolean;
      };
    const actions = async (like: string) =>
      (
        await c.h.pool.query('select action from audit_log where action like $1 order by at', [
          like,
        ])
      ).rows.map((r: { action: string }) => r.action);

    beforeAll(async () => {
      c = await setup(URL!, [], { mailer: mail, publicUrl: 'https://beta.exemple.org' });
      await c.h.db.insert(t.account).values({
        kind: 'admin',
        email: 'admin.groupe@exemple.org',
        passwordHash: await hashSecret(PW),
        country: 'FR',
      });
      const login = await c.req(
        'POST',
        '/api/v1/auth/login',
        {},
        { email: 'admin.groupe@exemple.org', password: PW },
      );
      A = { cookie: cookieOf(login) };
      const s = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
      await c.req('POST', '/api/v1/auth/totp/confirm', A, {
        code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
      });
    });
    afterAll(async () => {
      await c?.app.close();
      await c?.h.close();
    });
    beforeEach(async () => {
      await c.h.pool.query('delete from auth_throttle');
      await setFlagState(c.h.db, 'beta_contenu_differe_visible', 'on', null);
    });

    it('une invitation de groupe inscrit le compte dans le groupe ; une invitation ordinaire non', async () => {
      const inv = await c.req('POST', '/api/v1/admin/invitations', A, { groupe: 'beta_fermee' });
      expect(inv.statusCode).toBe(201);
      const { code, id } = inv.json() as { code: string; id: string };
      const liste = (await c.req('GET', '/api/v1/admin/acces', A)).json().invitations as Array<{
        id: string;
        groupe: string | null;
      }>;
      expect(liste.find((i) => i.id === id)!.groupe).toBe('beta_fermee');
      const r = await signup(addr(), code);
      expect(r.statusCode).toBe(201);
      const m = await me(cookieOf(r));
      expect(m.roles).toContain('beta_fermee');
      expect(m.betaDiffere).toBe(true);
      expect(await actions('groupe_beta.%')).toContain('groupe_beta.ajout_invitation');

      const ordinaire = await c.req('POST', '/api/v1/admin/invitations', A, {});
      const r2 = await signup(addr(), (ordinaire.json() as { code: string }).code);
      expect(r2.statusCode).toBe(201);
      const m2 = await me(cookieOf(r2));
      expect(m2.roles).not.toContain('beta_fermee');
      expect(m2.betaDiffere).toBe(false);
      // groupe inconnu : refusé à la création
      expect(
        (await c.req('POST', '/api/v1/admin/invitations', A, { groupe: 'autre' })).statusCode,
      ).toBe(400);
    });

    it('administration : ajout par adresse, liste, retrait ; droit perdu aussitôt ; tout est journalisé', async () => {
      const email = addr('membre');
      const r = await signup(email);
      expect(r.statusCode).toBe(201);
      const cookie = cookieOf(r);
      expect((await me(cookie)).betaDiffere).toBe(false);

      const ajout = await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: email });
      expect(ajout.statusCode).toBe(201);
      const { id } = ajout.json() as { id: string; dejaMembre: boolean };
      // déjà membre : 200, pas de second journal
      const encore = await c.req('POST', '/api/v1/admin/groupe-beta', A, {
        adresse: email.toUpperCase(),
      });
      expect(encore.statusCode).toBe(200);
      expect(encore.json().dejaMembre).toBe(true);
      // adresse inconnue : 404
      const inconnu = await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: addr('nul') });
      expect(inconnu.statusCode).toBe(404);
      expect(inconnu.json().error.code).toBe('compte_inconnu');

      const m = await me(cookie);
      expect(m.roles).toContain('beta_fermee');
      expect(m.betaDiffere).toBe(true);
      const liste = (await c.req('GET', '/api/v1/admin/groupe-beta', A)).json().membres as Array<{
        id: string;
        adresse: string;
      }>;
      expect(liste.some((x) => x.id === id && x.adresse === email)).toBe(true);

      // retrait : le droit est perdu à la requête suivante, sans reconnexion
      expect((await c.req('DELETE', `/api/v1/admin/groupe-beta/${id}`, A)).statusCode).toBe(200);
      const apres = await me(cookie);
      expect(apres.roles).not.toContain('beta_fermee');
      expect(apres.betaDiffere).toBe(false);
      expect((await c.req('DELETE', `/api/v1/admin/groupe-beta/${id}`, A)).statusCode).toBe(404);
      expect(
        (
          (await c.req('GET', '/api/v1/admin/groupe-beta', A)).json().membres as Array<{
            id: string;
          }>
        ).some((x) => x.id === id),
      ).toBe(false);

      const j = await actions('groupe_beta.%');
      expect(j.filter((a) => a === 'groupe_beta.ajout')).toHaveLength(1);
      expect(j).toContain('groupe_beta.retrait');
    });

    it('interrupteur beta_contenu_differe_visible éteint : le rôle seul ne donne rien (comportement du lot 5)', async () => {
      const email = addr('sw');
      const cookie = cookieOf(await signup(email));
      await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: email });
      expect((await me(cookie)).betaDiffere).toBe(true);
      await setFlagState(c.h.db, 'beta_contenu_differe_visible', 'off', null);
      const off = await me(cookie);
      expect(off.roles).toContain('beta_fermee');
      expect(off.betaDiffere).toBe(false);
      await setFlagState(c.h.db, 'beta_contenu_differe_visible', 'on', null);
      expect((await me(cookie)).betaDiffere).toBe(true);
    });

    it('administration réservée à l’administrateur avec second facteur : visiteur 401, parent 403', async () => {
      const { P } = await parent(c, addr('par'));
      for (const [m, u] of [
        ['GET', '/api/v1/admin/groupe-beta'],
        ['POST', '/api/v1/admin/groupe-beta'],
        ['DELETE', '/api/v1/admin/groupe-beta/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'],
      ] as const) {
        expect(
          (await c.req(m, u, {}, m === 'POST' ? { adresse: 'x@exemple.org' } : {})).statusCode,
          u,
        ).toBe(401);
        expect(
          (await c.req(m, u, P, m === 'POST' ? { adresse: 'x@exemple.org' } : {})).statusCode,
          u,
        ).toBe(403);
      }
      // un membre du groupe n'a aucun droit d'administration
      const email = addr('mb');
      const cookie = cookieOf(await signup(email));
      await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: email });
      expect((await c.req('GET', '/api/v1/admin/groupe-beta', { cookie })).statusCode).toBe(403);
    });
  },
);
