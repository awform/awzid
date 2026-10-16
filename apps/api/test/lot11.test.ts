/**
 * Lot 11 — bêta fermée et mots de passe (API, base de test) :
 *  - accepter une demande de liste d'attente pendant la bêta (inscription sur invitation) crée une invitation du groupe
 *    « bêta fermée » ; réglage `attente_groupe` = « aucun » (ouverture publique) ou inscription ouverte : sans groupe ;
 *  - la liste des invitations dit, sans adresse, quand le compte a été créé et s'il est dans le groupe ;
 *  - ajout manuel au groupe d'une adresse sans compte : 404 `compte_inconnu` ;
 *  - mot de passe des familles et adultes : 8 caractères et 3 types, ou phrase de 12 ; personnel : 12 caractères.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { accesParDefaut, groupeAcceptation, schema as t } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { estPersonnel } from '../src/auth/passwords.js';
import { memoryMailer } from '../src/mail/envoi.js';
import { cookieOf, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe('groupe de l’invitation créée en acceptant la liste d’attente (décision pure)', () => {
  it('bêta fermée seulement en inscription sur invitation et si le réglage le demande', () => {
    expect(groupeAcceptation({ inscription: 'invitation', attente_groupe: 'beta_fermee' })).toBe(
      'beta_fermee',
    );
    expect(groupeAcceptation({ inscription: 'invitation', attente_groupe: 'aucun' })).toBeNull();
    expect(groupeAcceptation({ inscription: 'ouverte', attente_groupe: 'beta_fermee' })).toBeNull();
    expect(accesParDefaut().attente_groupe).toBe('beta_fermee');
    expect(accesParDefaut({ acces: 'invitation' }).attente_groupe).toBe('beta_fermee');
  });
});

describe.skipIf(!URL)(
  'Lot 11 : liste d’attente → groupe, comptes créés, mots de passe (awform_test)',
  () => {
    let c: Ctx;
    let A: H;
    const mail = memoryMailer();
    let n = 0;
    const addr = (p = 'l11') => `${p}${++n}@exemple.org`;

    const signup = (email: string, over: Record<string, unknown> = {}) =>
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
          ...over,
        },
      );
    const reglage = (b: object) => c.req('PUT', '/api/v1/admin/acces', A, b);
    /** demande confirmée puis acceptée ; renvoie le code et l'identifiant de l'invitation */
    async function accepter(email: string) {
      await c.req('POST', '/api/v1/acces/liste-attente', {}, { email, consentement: true });
      await c.h.pool.query('update waitlist set confirmed_at = now() where email = $1', [email]);
      const liste = (await c.req('GET', '/api/v1/admin/liste-attente?statut=en_attente', A)).json()
        .demandes as Array<{ id: string; adresse: string }>;
      const d = liste.find((x) => x.adresse === email)!;
      const r = await c.req('POST', `/api/v1/admin/liste-attente/${d.id}/accepter`, A, {});
      expect(r.statusCode).toBe(200);
      return r.json() as { id: string; code: string };
    }
    const invitations = async () =>
      (await c.req('GET', '/api/v1/admin/acces', A)).json().invitations as Array<
        Record<string, unknown> & { id: string }
      >;

    beforeAll(async () => {
      c = await setup(URL!, [], { mailer: mail, publicUrl: 'https://beta.exemple.org' });
      await c.h.db.insert(t.account).values({
        kind: 'admin',
        email: 'admin.l11@exemple.org',
        passwordHash: await hashSecret(PW),
        country: 'FR',
      });
      A = {
        cookie: cookieOf(
          await c.req(
            'POST',
            '/api/v1/auth/login',
            {},
            { email: 'admin.l11@exemple.org', password: PW },
          ),
        ),
      };
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
    });

    it('bêta (sur invitation) : la demande acceptée donne une invitation du groupe ; le compte y entre', async () => {
      expect(
        (await reglage({ mode: 'invitation', attente_groupe: 'beta_fermee' })).statusCode,
      ).toBe(200);
      expect((await c.req('GET', '/api/v1/admin/acces', A)).json().acces.attente_groupe).toBe(
        'beta_fermee',
      );
      const email = addr();
      const inv = await accepter(email);
      let ligne = (await invitations()).find((i) => i.id === inv.id)!;
      expect(ligne.groupe).toBe('beta_fermee');
      expect(ligne.comptes).toBe(0);
      expect(ligne.compteCreeLe).toBeNull();
      const r = await signup(email, { invitation: inv.code });
      expect(r.statusCode).toBe(201);
      const me = (await c.req('GET', '/api/v1/auth/me', { cookie: cookieOf(r) })).json();
      expect(me.roles).toContain('beta_fermee');
      ligne = (await invitations()).find((i) => i.id === inv.id)!;
      expect(ligne.comptes).toBe(1);
      expect(ligne.comptesGroupe).toBe(1);
      expect(Date.now() - new Date(String(ligne.compteCreeLe)).getTime()).toBeLessThan(60_000);
      // minimisation : aucune nouvelle donnée personnelle dans la ligne (seulement l'adresse de l'invitation personnelle)
      expect(Object.keys(ligne).sort()).toEqual(
        [
          'adresse',
          'compteCreeLe',
          'comptes',
          'comptesGroupe',
          'creeeLe',
          'demande',
          'etat',
          'expireLe',
          'fin',
          'groupe',
          'id',
          'libelle',
          'max',
          'revoqueeLe',
          'usages',
        ].sort(),
      );
      const audit = await c.h.pool.query(
        "select after from audit_log where action = 'attente.acceptation' order by at desc limit 1",
      );
      expect(audit.rows[0].after).toEqual({ groupe: 'beta_fermee' });
    });

    it('réglage « aucun » (ouverture publique) ou inscription ouverte : invitation sans groupe ; retour arrière', async () => {
      await reglage({ mode: 'invitation', attente_groupe: 'aucun' });
      expect((await c.req('GET', '/api/v1/admin/acces', A)).json().acces.attente_groupe).toBe(
        'aucun',
      );
      const e1 = addr();
      const i1 = await accepter(e1);
      expect((await invitations()).find((i) => i.id === i1.id)!.groupe).toBeNull();
      const r = await signup(e1, { invitation: i1.code });
      expect(r.statusCode).toBe(201);
      const ligne = (await invitations()).find((i) => i.id === i1.id)!;
      expect(ligne.comptes).toBe(1);
      expect(ligne.comptesGroupe).toBe(0);

      await reglage({ mode: 'ouvert', attente_groupe: 'beta_fermee' });
      const i2 = await accepter(addr());
      expect((await invitations()).find((i) => i.id === i2.id)!.groupe).toBeNull();

      // retour arrière : de nouveau sur invitation → groupe
      await reglage({ mode: 'invitation' });
      const i3 = await accepter(addr());
      expect((await invitations()).find((i) => i.id === i3.id)!.groupe).toBe('beta_fermee');
      expect((await reglage({ attente_groupe: 'peut-être' })).statusCode).toBe(400);
    });

    it('ajout manuel au groupe : adresse sans compte → 404 compte_inconnu ; avec compte → 201', async () => {
      await reglage({ mode: 'ouvert' });
      const r = await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: addr('personne') });
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('compte_inconnu');
      const email = addr();
      expect((await signup(email)).statusCode).toBe(201);
      expect(
        (await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: email })).statusCode,
      ).toBe(201);
    });

    it('inscription : 8 caractères et 3 types acceptés ; 11 caractères et 2 types refusés ; 7 refusés', async () => {
      await reglage({ mode: 'ouvert' });
      expect((await signup(addr(), { password: 'Tamari7x' })).statusCode).toBe(201);
      const simple = await signup(addr(), { password: 'tamarinier7' });
      expect(simple.statusCode).toBe(400);
      expect(simple.json().error.code).toBe('mot_de_passe_trop_simple');
      expect((await signup(addr(), { password: 'Tamar7x' })).json().error.code).toBe(
        'mot_de_passe_trop_court',
      );
      expect((await signup(addr(), { password: 'mon thé à la menthe' })).statusCode).toBe(201);
    });

    it('changement : famille → règle des familles ; personnel (rôle de plateforme) → 12 caractères', async () => {
      await reglage({ mode: 'ouvert' });
      const email = addr();
      const r = await signup(email);
      const F = { cookie: cookieOf(r) };
      const [acc] = await c.h.db
        .select({ id: t.account.id })
        .from(t.account)
        .where(eq(t.account.email, email));
      expect(await estPersonnel(c.h.db, acc!.id)).toBe(false);
      const ok = await c.req('POST', '/api/v1/auth/password', F, { current: PW, next: 'Tamari7x' });
      expect(ok.statusCode).toBe(200);
      // même compte avec un rôle de personnel : 12 caractères exigés (comme avant)
      await c.h.db.insert(t.accountRole).values({ accountId: acc!.id, role: 'support' });
      expect(await estPersonnel(c.h.db, acc!.id)).toBe(true);
      expect(await estPersonnel(c.h.db, null)).toBe(false);
      const court = await c.req('POST', '/api/v1/auth/password', F, {
        current: 'Tamari7x',
        next: 'Tamarinier7',
      });
      expect(court.json().error?.code).toBe('mot_de_passe_trop_court');
    });
  },
);
