/**
 * Bêta fermée sur invitation (API, base de test) :
 *  - codes : format, empreinte seule en base, usage unique ou limité, expiration, révocation, invitation
 *    personnelle (adresse), consommation atomique (inscriptions simultanées) ;
 *  - inscription : ouverte par défaut, « invitation » exige un code valable, un code est contrôlé même en mode ouvert ;
 *  - liste d'attente : demande avec consentement, réponse identique si l'adresse existe, acceptation (invitation
 *    personnelle envoyée par e-mail dans la langue de la personne) et refus, effacement après 12 mois ;
 *  - mode fermé : tout l'API répond « acces_ferme » aux non-administrateurs, retour arrière en une action ;
 *  - administration réservée à l'administrateur avec second facteur ; bandeau réglable ;
 *  - journal d'erreurs sans donnée personnelle.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  generateCode,
  invalidateAcces,
  normalizeCode,
  purgeListeAttente,
  schema as t,
} from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { scrub } from '../src/app.js';
import { memoryMailer } from '../src/mail/envoi.js';
import { cookieOf, parent, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe('codes d’invitation (décision pure)', () => {
  it('format AWZ-XXXXX-XXXXX, sans caractères ambigus, tirage différent à chaque fois', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toMatch(/^AWZ-[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/);
      expect(c.slice(4)).not.toMatch(/[01OILU]/);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });
  it('la saisie à la main est tolérée (casse, espaces, tirets, préfixe) mais pas les caractères ambigus', () => {
    expect(normalizeCode('awz-abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeCode('  ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normalizeCode('AWZ-ABCDE-FGHJ')).toBeNull(); // trop court
    expect(normalizeCode('AWZ-ABCDO-FGHJK')).toBeNull(); // « O » absent de l'alphabet
    expect(normalizeCode('')).toBeNull();
  });
  it('le journal d’erreurs retire adresses, identifiants, jetons et adresses IP', () => {
    const s = scrub(
      'Key (email)=(prenom.nom@exemple.org) for 0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b token ' +
        'abcdefghijklmnopqrstuvwxyz0123456789ABCD ip 203.0.113.77',
    );
    expect(s).not.toContain('@');
    expect(s).not.toContain('0190a1b2');
    expect(s).not.toContain('abcdefghijklmnop');
    expect(s).toContain('203.0.113.0');
    expect(s).not.toContain('203.0.113.77');
  });
});

describe.skipIf(!URL)(
  'Bêta fermée : invitations, liste d’attente, mode fermé (awform_test)',
  () => {
    let c: Ctx;
    let A: H; // administrateur (second facteur)
    const mail = memoryMailer();
    let n = 0;
    const addr = (p = 'bw') => `${p}${++n}@exemple.org`;

    const signup = (email: string, invitation?: string, extra: object = {}) =>
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
          ...extra,
        },
      );
    const reglage = (body: object) => c.req('PUT', '/api/v1/admin/acces', A, body);
    const inviter = async (body: object = {}) => {
      const r = await c.req('POST', '/api/v1/admin/invitations', A, body);
      expect(r.statusCode).toBe(201);
      return r.json() as {
        id: string;
        code: string;
        lien: string | null;
        expireLe: string | null;
        envoye: boolean;
      };
    };

    beforeAll(async () => {
      c = await setup(URL!, [], { mailer: mail, publicUrl: 'https://beta.exemple.org' });
      await c.h.db.insert(t.account).values({
        kind: 'admin',
        email: 'admin.beta@exemple.org',
        passwordHash: await hashSecret(PW),
        country: 'FR',
      });
      const login = await c.req(
        'POST',
        '/api/v1/auth/login',
        {},
        { email: 'admin.beta@exemple.org', password: PW },
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
      // limites anti-essais par adresse IP : remises à zéro entre les scénarios
      await c.h.pool.query('delete from auth_throttle');
      mail.sent.length = 0;
    });

    it('par défaut : inscription ouverte, site ouvert, bandeau affiché ; un visiteur lit le statut', async () => {
      const r = await c.req('GET', '/api/v1/acces/statut');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        mode: 'ouvert',
        inscription: 'ouverte',
        site: 'ouvert',
        bandeau: 'on',
        verification: 'souple',
        antibot: 'off',
        admin: false,
      });
      expect((await signup(addr())).statusCode).toBe(201);
    });

    it('l’administration est réservée à l’administrateur avec second facteur', async () => {
      expect((await c.req('GET', '/api/v1/admin/acces')).statusCode).toBe(401);
      expect((await c.req('POST', '/api/v1/admin/invitations', {}, {})).statusCode).toBe(401);
      const { P } = await parent(c, addr('par'));
      for (const [m, u] of [
        ['GET', '/api/v1/admin/acces'],
        ['POST', '/api/v1/admin/invitations'],
        ['PUT', '/api/v1/admin/acces'],
        ['GET', '/api/v1/admin/liste-attente'],
        ['DELETE', '/api/v1/admin/liste-attente/00000000-0000-4000-8000-000000000000'],
      ] as const)
        expect((await c.req(m, u, P, m === 'PUT' ? { site: 'ouvert' } : {})).statusCode).toBe(403);
      expect((await c.req('GET', '/api/v1/admin/acces', A)).statusCode).toBe(200);
    });

    it('mode « invitation » : sans code, refusé ; avec un mauvais code, refusé ; avec un bon code, accepté', async () => {
      expect((await reglage({ inscription: 'invitation' })).json().acces.inscription).toBe(
        'invitation',
      );
      expect((await c.req('GET', '/api/v1/acces/statut')).json().inscription).toBe('invitation');
      const sans = await signup(addr());
      expect(sans.statusCode).toBe(403);
      expect(sans.json().error.code).toBe('invitation_requise');
      expect((await signup(addr(), 'AWZ-AAAAA-BBBBB')).json().error.code).toBe(
        'invitation_inconnue',
      );
      expect((await signup(addr(), 'n’importe quoi')).json().error.code).toBe('code_invalide');
      const inv = await inviter({ libelle: 'Relecteur A' });
      expect(inv.code).toMatch(/^AWZ-/);
      expect(inv.lien).toBe(`https://beta.exemple.org/inscription#code=${inv.code}`);
      const ok = await signup(addr(), inv.code.toLowerCase().replace(/-/g, ' '));
      expect(ok.statusCode).toBe(201);
      // usage unique : le même code ne sert plus
      expect((await signup(addr(), inv.code)).json().error.code).toBe('invitation_epuisee');
      await reglage({ inscription: 'ouverte' });
    });

    it('le code n’est jamais gardé en clair ; la liste ne montre que les quatre derniers caractères', async () => {
      const inv = await inviter({ libelle: 'Famille B', max: 3, jours: 10 });
      const rows = await c.h.pool.query('select * from invitation where id = $1', [inv.id]);
      expect(JSON.stringify(rows.rows[0])).not.toContain(inv.code.slice(4));
      expect(rows.rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
      const liste = (await c.req('GET', '/api/v1/admin/acces', A)).json().invitations as Array<{
        id: string;
        fin: string;
        etat: string;
        max: number;
      }>;
      const l = liste.find((x) => x.id === inv.id)!;
      expect(l.fin).toBe(inv.code.slice(-4));
      expect(l.etat).toBe('active');
      expect(l.max).toBe(3);
      expect(JSON.stringify(liste)).not.toContain(inv.code);
    });

    it('usage limité : trois inscriptions puis épuisée ; un code est contrôlé même en mode ouvert', async () => {
      const inv = await inviter({ max: 3 });
      const chk = await c.req('POST', '/api/v1/acces/invitation', {}, { code: inv.code });
      expect(chk.json()).toEqual({ valide: true, personnelle: false });
      for (let i = 0; i < 3; i++) expect((await signup(addr(), inv.code)).statusCode).toBe(201);
      expect((await signup(addr(), inv.code)).json().error.code).toBe('invitation_epuisee');
      expect(
        (await c.req('POST', '/api/v1/acces/invitation', {}, { code: inv.code })).statusCode,
      ).toBe(403);
      // mode ouvert + mauvais code : refusé quand même (le code donné doit être bon)
      expect((await signup(addr(), 'AWZ-22222-33333')).json().error.code).toBe(
        'invitation_inconnue',
      );
      const [row] = await c.h.db.select().from(t.invitation).where(eq(t.invitation.id, inv.id));
      expect(row?.uses).toBe(3);
      const used = await c.h.pool.query(
        'select count(*)::int as n from invitation_use where invitation_id = $1',
        [inv.id],
      );
      expect(used.rows[0].n).toBe(3);
    });

    it('invitation personnelle : seule l’adresse invitée peut s’inscrire ; envoi par e-mail dans sa langue', async () => {
      const dest = addr('perso');
      const inv = await inviter({ adresse: dest, envoyer: true, langue: 'en', max: 5 });
      expect(inv.envoye).toBe(true);
      expect(mail.sent).toHaveLength(1);
      const m = mail.sent[0]!;
      expect(m.to).toBe(dest);
      expect(m.kind).toBe('invitation');
      expect(m.subject).toBe('Your invitation to the Awzid beta');
      expect(m.text).toContain(inv.lien!);
      // une invitation personnelle n'a qu'un usage, quel que soit le « max » demandé
      const [row] = await c.h.db.select().from(t.invitation).where(eq(t.invitation.id, inv.id));
      expect(row?.maxUses).toBe(1);
      expect((await signup(addr('autre'), inv.code)).json().error.code).toBe(
        'invitation_autre_adresse',
      );
      expect((await signup(dest.toUpperCase(), inv.code)).statusCode).toBe(201);
    });

    it('expiration et révocation', async () => {
      const vieille = await inviter({ jours: 1 });
      await c.h.pool.query(
        "update invitation set expires_at = now() - interval '1 minute' where id = $1",
        [vieille.id],
      );
      expect((await signup(addr(), vieille.code)).json().error.code).toBe('invitation_expiree');
      const sans = await inviter({ jours: 0 });
      const [r0] = await c.h.db.select().from(t.invitation).where(eq(t.invitation.id, sans.id));
      expect(r0?.expiresAt).toBeNull();
      const rev = await inviter({ max: 5 });
      expect(
        (await c.req('POST', `/api/v1/admin/invitations/${rev.id}/revoquer`, A, {})).statusCode,
      ).toBe(200);
      expect((await signup(addr(), rev.code)).json().error.code).toBe('invitation_revoquee');
      // révoquer deux fois, ou une invitation inconnue : introuvable
      expect(
        (await c.req('POST', `/api/v1/admin/invitations/${rev.id}/revoquer`, A, {})).statusCode,
      ).toBe(404);
      expect(
        (
          await c.req(
            'POST',
            '/api/v1/admin/invitations/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/revoquer',
            A,
            {},
          )
        ).statusCode,
      ).toBe(404);
      const etats = (await c.req('GET', '/api/v1/admin/acces', A)).json().invitations as Array<{
        id: string;
        etat: string;
      }>;
      expect(etats.find((x) => x.id === rev.id)?.etat).toBe('revoquee');
      expect(etats.find((x) => x.id === vieille.id)?.etat).toBe('expiree');
    });

    it('consommation atomique : cinq inscriptions simultanées avec un code à usage unique, une seule réussit', async () => {
      const inv = await inviter();
      const res = await Promise.all(
        Array.from({ length: 5 }, () => signup(addr('conc'), inv.code)),
      );
      expect(res.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect(res.filter((r) => r.statusCode === 403)).toHaveLength(4);
      const [row] = await c.h.db.select().from(t.invitation).where(eq(t.invitation.id, inv.id));
      expect(row?.uses).toBe(1);
    });

    it('une adresse déjà inscrite ne consomme pas l’invitation', async () => {
      const dest = addr('dej');
      expect((await signup(dest)).statusCode).toBe(201);
      const inv = await inviter();
      expect((await signup(dest, inv.code)).statusCode).toBe(409);
      const [row] = await c.h.db.select().from(t.invitation).where(eq(t.invitation.id, inv.id));
      expect(row?.uses).toBe(0);
    });

    it('essais de codes limités par adresse IP', async () => {
      let last = 0;
      for (let i = 0; i < 14; i++)
        last = (
          await c.req(
            'POST',
            '/api/v1/acces/invitation',
            {},
            { code: `AWZ-2222${(i % 8) + 2}-33333` },
          )
        ).statusCode;
      expect(last).toBe(429);
    });

    it('liste d’attente : demande avec consentement, réponse identique, acceptation et refus', async () => {
      const dest = addr('att');
      const body = {
        email: dest,
        nom: 'Aïcha',
        mot: 'Je suis enseignante',
        langue: 'es',
        consentement: true,
      };
      expect(
        (await c.req('POST', '/api/v1/acces/liste-attente', {}, { ...body, consentement: false }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await c.req(
            'POST',
            '/api/v1/acces/liste-attente',
            {},
            { ...body, email: 'pas-une-adresse' },
          )
        ).statusCode,
      ).toBe(400);
      const r1 = await c.req('POST', '/api/v1/acces/liste-attente', {}, body);
      const r2 = await c.req('POST', '/api/v1/acces/liste-attente', {}, body);
      expect(r1.statusCode).toBe(202);
      expect(r2.statusCode).toBe(202);
      expect(r2.json()).toEqual(r1.json());
      const refusee = addr('att');
      await c.req(
        'POST',
        '/api/v1/acces/liste-attente',
        {},
        { email: refusee, consentement: true },
      );
      // double consentement : tant que l'adresse n'est pas confirmée par e-mail, l'administrateur ne la voit pas
      const avant = (await c.req('GET', '/api/v1/admin/liste-attente?statut=en_attente', A)).json()
        .demandes as Array<{ adresse: string }>;
      expect(avant.some((d) => d.adresse === dest)).toBe(false);
      await c.h.pool.query(
        'update waitlist set confirmed_at = now() where email = any($1::text[])',
        [[dest, refusee]],
      );
      const liste = (await c.req('GET', '/api/v1/admin/liste-attente?statut=en_attente', A)).json()
        .demandes as Array<{
        id: string;
        adresse: string;
        langue: string;
        nom: string | null;
      }>;
      const mine = liste.filter((d) => d.adresse === dest);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ nom: 'Aïcha', langue: 'es' });
      // acceptation : invitation personnelle envoyée dans la langue de la demande
      const acc = await c.req('POST', `/api/v1/admin/liste-attente/${mine[0]!.id}/accepter`, A, {});
      expect(acc.statusCode).toBe(200);
      const inv = acc.json() as { code: string; envoye: boolean };
      expect(inv.envoye).toBe(true);
      expect(mail.sent.find((m) => m.kind === 'invitation')).toMatchObject({
        to: dest,
        kind: 'invitation',
        subject: 'Su invitación a la beta de Awzid',
      });
      expect(
        (await c.req('POST', `/api/v1/admin/liste-attente/${mine[0]!.id}/accepter`, A, {}))
          .statusCode,
      ).toBe(409);
      await reglage({ inscription: 'invitation' });
      expect((await signup(addr('autre'), inv.code)).json().error.code).toBe(
        'invitation_autre_adresse',
      );
      expect((await signup(dest, inv.code)).statusCode).toBe(201);
      await reglage({ inscription: 'ouverte' });
      // refus
      const idRefus = liste.find((d) => d.adresse === refusee)!.id;
      expect(
        (await c.req('POST', `/api/v1/admin/liste-attente/${idRefus}/refuser`, A, {})).statusCode,
      ).toBe(200);
      expect(
        (await c.req('POST', `/api/v1/admin/liste-attente/${idRefus}/refuser`, A, {})).statusCode,
      ).toBe(404);
      const toutes = (await c.req('GET', '/api/v1/admin/liste-attente', A)).json()
        .demandes as Array<{ id: string; adresse: string; statut: string }>;
      expect(toutes.find((d) => d.adresse === dest)?.statut).toBe('acceptee');
      expect(toutes.find((d) => d.adresse === refusee)?.statut).toBe('refusee');
      // désinscription / droit à l'effacement : la demande disparaît ; une seconde fois, introuvable
      const idEfface = toutes.find((d) => d.adresse === refusee)!.id;
      expect((await c.req('DELETE', `/api/v1/admin/liste-attente/${idEfface}`, A)).statusCode).toBe(
        200,
      );
      expect((await c.req('DELETE', `/api/v1/admin/liste-attente/${idEfface}`, A)).statusCode).toBe(
        404,
      );
      const apres = (await c.req('GET', '/api/v1/admin/liste-attente', A)).json()
        .demandes as Array<{
        adresse: string;
      }>;
      expect(apres.some((d) => d.adresse === refusee)).toBe(false);
    });

    it('liste d’attente : double consentement (e-mail de confirmation, lien, désinscription, effacement sous 7 jours)', async () => {
      const dest = addr('dc');
      mail.sent.length = 0;
      const r = await c.req(
        'POST',
        '/api/v1/acces/liste-attente',
        {},
        { email: dest, langue: 'en', consentement: true },
      );
      expect(r.statusCode).toBe(202);
      await new Promise((res) => setTimeout(res, 300));
      const m = mail.sent.find((x) => x.to === dest && x.kind === 'liste_attente');
      expect(m?.subject).toBe('Confirm your place on the Awzid waiting list');
      const lien = /https:\/\/beta\.exemple\.org\/bienvenue\/confirmer\?lang=en#t=([\w-]+)/.exec(
        m!.text,
      );
      const desinsc =
        /https:\/\/beta\.exemple\.org\/bienvenue\/desinscription\?lang=en#t=([\w-]+)/.exec(m!.text);
      expect(lien && desinsc).toBeTruthy();
      const jeton = lien![1]!;
      expect(desinsc![1]).toBe(jeton);
      // seule l'empreinte du jeton est gardée
      const ligne = (
        await c.h.pool.query('select token_hash, confirmed_at from waitlist where email = $1', [
          dest,
        ])
      ).rows[0] as { token_hash: string; confirmed_at: Date | null };
      expect(ligne.confirmed_at).toBeNull();
      expect(ligne.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(ligne.token_hash).not.toContain(jeton);
      // lien inconnu : refusé ; lien bon : confirmé, puis « déjà confirmée » ; visible de l'administrateur seulement ensuite
      const inconnu = await c.req(
        'POST',
        '/api/v1/acces/liste-attente/confirmer',
        {},
        { token: 'x'.repeat(43) },
      );
      expect(inconnu.statusCode).toBe(400);
      expect(inconnu.json().error.code).toBe('lien_invalide');
      const vue = async () =>
        (
          (await c.req('GET', '/api/v1/admin/liste-attente?statut=en_attente', A)).json()
            .demandes as Array<{ adresse: string }>
        ).some((d) => d.adresse === dest);
      expect(await vue()).toBe(false);
      expect(
        (await c.req('POST', '/api/v1/acces/liste-attente/confirmer', {}, { token: jeton })).json(),
      ).toEqual({ etat: 'confirmee' });
      expect(
        (await c.req('POST', '/api/v1/acces/liste-attente/confirmer', {}, { token: jeton })).json(),
      ).toEqual({ etat: 'deja' });
      expect(await vue()).toBe(true);
      // désinscription par le lien de l'e-mail : la demande est effacée
      expect(
        (await c.req('POST', '/api/v1/acces/liste-attente/desinscrire', {}, { token: jeton }))
          .statusCode,
      ).toBe(200);
      expect(
        (await c.req('POST', '/api/v1/acces/liste-attente/desinscrire', {}, { token: jeton }))
          .statusCode,
      ).toBe(400);
      expect(await vue()).toBe(false);
      // non confirmée : effacée après 7 jours, et le lien expiré ne confirme plus
      const vieux = addr('dc');
      await c.req('POST', '/api/v1/acces/liste-attente', {}, { email: vieux, consentement: true });
      const t2 = (await c.h.pool.query('select token_hash from waitlist where email = $1', [vieux]))
        .rows[0].token_hash as string;
      expect(t2).toBeTruthy();
      await c.h.pool.query(
        "update waitlist set created_at = now() - interval '8 days' where email = $1",
        [vieux],
      );
      const n = await purgeListeAttente(c.h.db);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(
        (await c.h.pool.query('select 1 from waitlist where email = $1', [vieux])).rowCount,
      ).toBe(0);
    });

    it('liste d’attente : limite par adresse IP et effacement après 12 mois', async () => {
      let last = 0;
      for (let i = 0; i < 12; i++)
        last = (
          await c.req(
            'POST',
            '/api/v1/acces/liste-attente',
            {},
            { email: addr('lim'), consentement: true },
          )
        ).statusCode;
      expect(last).toBe(429);
      await c.h.pool.query(
        "update waitlist set created_at = now() - interval '13 months' where email like 'lim%'",
      );
      const n0 = (await c.h.pool.query('select count(*)::int as n from waitlist')).rows[0]
        .n as number;
      const del = await purgeListeAttente(c.h.db);
      expect(del).toBeGreaterThanOrEqual(1);
      expect((await c.h.pool.query('select count(*)::int as n from waitlist')).rows[0].n).toBe(
        n0 - del,
      );
    });

    it('mode fermé : tout est fermé aux non-administrateurs, retour arrière en une action', async () => {
      const { P } = await parent(c, addr('fer'));
      expect((await c.req('GET', '/api/v1/levels', P)).statusCode).toBe(200);
      // fermeture
      expect((await reglage({ site: 'ferme' })).json().acces.site).toBe('ferme');
      const closed = await c.req('GET', '/api/v1/levels', P);
      expect(closed.statusCode).toBe(503);
      expect(closed.json().error.code).toBe('acces_ferme');
      expect(closed.headers['retry-after']).toBeTruthy();
      expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(503); // visiteur
      // restent joignables : santé, sonde, statut
      expect((await c.req('GET', '/api/v1/health')).statusCode).toBe(200);
      expect((await c.req('GET', '/healthz')).statusCode).toBe(200);
      const st = (await c.req('GET', '/api/v1/acces/statut')).json();
      expect(st).toMatchObject({ site: 'ferme', admin: false });
      expect((await c.req('GET', '/api/v1/acces/statut', A)).json().admin).toBe(true);
      // ni inscription ni connexion pour un non-administrateur (mot de passe juste)
      const su = await signup(addr());
      expect(su.statusCode).toBe(503);
      expect(su.json().error.code).toBe('acces_ferme');
      const li = await c.req(
        'POST',
        '/api/v1/auth/login',
        {},
        {
          email: (await c.h.pool.query("select email from account where kind='parent' limit 1"))
            .rows[0].email,
          password: PW,
        },
      );
      expect(li.statusCode).toBe(503);
      expect(li.headers['set-cookie']).toBeUndefined();
      // l'administrateur garde la main (session existante et nouvelle connexion)
      expect((await c.req('GET', '/api/v1/levels', A)).statusCode).toBe(200);
      expect((await c.req('GET', '/api/v1/admin/acces', A)).json().acces.site).toBe('ferme');
      // retour arrière : un seul réglage
      expect((await reglage({ site: 'ouvert' })).json().acces.site).toBe('ouvert');
      expect((await c.req('GET', '/api/v1/levels', P)).statusCode).toBe(200);
      expect((await signup(addr())).statusCode).toBe(201);
      const re = await c.req(
        'POST',
        '/api/v1/auth/login',
        {},
        {
          email: (await c.h.pool.query("select email from account where kind='parent' limit 1"))
            .rows[0].email,
          password: PW,
        },
      );
      expect(re.statusCode).toBe(200);
    });

    it('le réglage survit au cache : relu depuis la base après invalidation', async () => {
      await reglage({ site: 'ferme' });
      invalidateAcces();
      expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(503);
      await c.h.pool.query("delete from site_setting where key = 'site'"); // « retour au défaut » par la base
      invalidateAcces();
      expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(200);
    });

    it('bandeau bêta : réglable par l’administrateur', async () => {
      expect((await reglage({ bandeau: 'off' })).json().acces.bandeau).toBe('off');
      expect((await c.req('GET', '/api/v1/acces/statut')).json().bandeau).toBe('off');
      await reglage({ bandeau: 'on' });
      expect((await c.req('GET', '/api/v1/acces/statut')).json().bandeau).toBe('on');
      expect((await reglage({ site: 'à moitié' })).statusCode).toBe(400);
      expect((await reglage({})).statusCode).toBe(400);
    });

    it('actions d’administration journalisées sans code ni adresse', async () => {
      const rows = await c.h.pool.query(
        "select action, after from audit_log where action like 'acces.%' or action like 'invitation.%' or action like 'attente.%'",
      );
      expect(rows.rowCount).toBeGreaterThan(5);
      expect(JSON.stringify(rows.rows)).not.toMatch(/AWZ-[2-9A-Z]{5}-/);
      expect(JSON.stringify(rows.rows)).not.toContain('@exemple.org');
    });
  },
);
