/**
 * Bêta — trois modes d'accès commutables sans redéploiement (fermé, sur invitation, ouvert), plafond d'inscriptions
 * du mode ouvert (liste d'attente automatique), retour arrière, anti-robots (jeton, délai, champ piège), vérification de
 * l'adresse avant activation, tableau de bord et plafonds de consommation (API, base de test).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  accesParDefaut,
  inscriptionEffective,
  invalidateAcces,
  modeDe,
  reglagesDuMode,
  schema as t,
} from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { emettreJeton, verifierJeton, ANTIBOT_MAX_MS, ANTIBOT_MIN_MS } from '../src/antibot.js';
import { memoryMailer } from '../src/mail/envoi.js';
import { listePlafonds, STOCKAGE_PAR_ELEVE_OCTETS } from '../src/plafonds.js';
import { child, cookieOf, parent, PW, setup, YEAR, type Ctx } from './helpers.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe('modes d’accès (décision pure)', () => {
  it('trois modes : fermé, sur invitation, ouvert ; la fermeture ne touche pas à l’inscription', () => {
    expect(modeDe({ site: 'ferme', inscription: 'ouverte' })).toBe('ferme');
    expect(modeDe({ site: 'ouvert', inscription: 'invitation' })).toBe('invitation');
    expect(modeDe({ site: 'ouvert', inscription: 'ouverte' })).toBe('ouvert');
    expect(reglagesDuMode('ferme')).toEqual({ site: 'ferme' });
    expect(reglagesDuMode('invitation')).toEqual({ site: 'ouvert', inscription: 'invitation' });
    expect(reglagesDuMode('ouvert')).toEqual({ site: 'ouvert', inscription: 'ouverte' });
  });
  it('le mode ouvert porte toujours un plafond : plein, il passe en liste d’attente', () => {
    const a = { inscription: 'ouverte' as const, plafond: 3 };
    expect(inscriptionEffective(a, 2)).toBe('ouverte');
    expect(inscriptionEffective(a, 3)).toBe('attente');
    expect(inscriptionEffective(a, 99)).toBe('attente');
    expect(inscriptionEffective({ inscription: 'invitation', plafond: 3 }, 99)).toBe('invitation');
    expect(accesParDefaut({}).plafond).toBe(200); // jamais « sans limite »
    expect(accesParDefaut({ plafond: '50' }).plafond).toBe(50);
    expect(accesParDefaut({ plafond: 'abc' }).plafond).toBe(200);
    expect(accesParDefaut({ plafond: '-4' }).plafond).toBe(200);
    expect(
      accesParDefaut({ acces: 'invitation', verification: 'requise', antibot: 'on' }),
    ).toMatchObject({
      inscription: 'invitation',
      verification: 'requise',
      antibot: 'on',
    });
  });
});

describe('anti-robots (jeton signé)', () => {
  const cle = Buffer.alloc(32, 7);
  it('refuse un jeton absent, falsifié, trop récent ou trop ancien ; accepte entre 3 s et 2 h', () => {
    const now = 1_800_000_000_000;
    const j = emettreJeton(cle, now);
    expect(verifierJeton(cle, undefined, now)).toBe('absent');
    expect(verifierJeton(cle, 'n’importe quoi', now)).toBe('invalide');
    expect(verifierJeton(cle, `${now}.AAAA`, now + 5000)).toBe('invalide');
    expect(verifierJeton(Buffer.alloc(32, 8), j, now + 5000)).toBe('invalide'); // autre clé
    expect(verifierJeton(cle, j, now + ANTIBOT_MIN_MS - 1)).toBe('trop_rapide');
    expect(verifierJeton(cle, j, now + ANTIBOT_MIN_MS)).toBe('ok');
    expect(verifierJeton(cle, j, now + ANTIBOT_MAX_MS)).toBe('ok');
    expect(verifierJeton(cle, j, now + ANTIBOT_MAX_MS + 1)).toBe('expire');
    // un jeton d’une autre heure ne se transpose pas
    expect(verifierJeton(cle, `${now + 1}.${j.split('.')[1]}`, now + 9000)).toBe('invalide');
  });
});

describe('plafonds de consommation par utilisateur', () => {
  it('regroupés au même endroit : tuteur, écoute, voix, stockage, avis', () => {
    const l = listePlafonds();
    expect(l.map((p) => p.cle)).toEqual(['tuteur', 'ecoute', 'voix', 'stockage', 'avis']);
    expect(STOCKAGE_PAR_ELEVE_OCTETS).toBe(30 * 1_048_576);
    // le plafond de stockage est appliqué à l'envoi d'une récitation
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'recitations.ts'), 'utf8');
    expect(src).toContain('STOCKAGE_PAR_ELEVE_OCTETS');
    expect(src).toContain("'quota_stockage'");
  });
});

describe.skipIf(!URL)('Bêta : trois modes, plafond, vérification, tableau (awform_test)', () => {
  let c: Ctx;
  let A: H;
  const mail = memoryMailer();
  let n = 0;
  const addr = (p = 'md') => `${p}${++n}@exemple.org`;
  const reglage = (b: object) => c.req('PUT', '/api/v1/admin/acces', A, b);
  const signup = (email: string, extra: object = {}) =>
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
        ...extra,
      },
    );
  const statut = async () => (await c.req('GET', '/api/v1/acces/statut')).json();
  const comptes = async () =>
    Number(
      (
        await c.h.pool.query(
          "select count(*) from account where kind in ('parent','adulte') and deleted_at is null",
        )
      ).rows[0].count,
    );

  beforeAll(async () => {
    c = await setup(URL!, [], { mailer: mail, publicUrl: 'https://beta.exemple.org' });
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.modes@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const login = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'admin.modes@exemple.org', password: PW },
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
    mail.sent.length = 0;
  });

  it('bêta « sur invitation » : le contenu (livres, Coran) est fermé aux anonymes, ouvert aux connectés ; le mode ouvert le rend à tous', async () => {
    const { P } = await (async () => {
      const r = await signup(addr('cont'));
      return { P: { cookie: cookieOf(r) } };
    })();
    await reglage({ mode: 'invitation' });
    for (const u of [
      '/api/v1/levels',
      '/api/v1/units/x',
      '/api/v1/packs',
      '/api/v1/quran/1',
      '/api/v1/vivre',
    ]) {
      const r = await c.req('GET', u);
      expect(r.statusCode, u).toBe(401);
      expect(r.json().error.code).toBe('connexion_requise');
    }
    // restent publics : santé, statut, pays, errata ; connecté : le contenu répond
    expect((await c.req('GET', '/api/v1/health')).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/acces/statut')).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/levels', P)).statusCode).toBe(200);
    await reglage({ mode: 'ouvert' });
    expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(200);
  });

  it('Quran Foundation et profils d’enfants : désactivé par défaut pour les enfants seulement, réglable, refus aussi côté serveur', async () => {
    const { P } = await parent(c, addr('qf'));
    const kid = await child(c, P, 'Petit', 8);
    const teen = await child(c, P, 'Ado', 15);
    const fonctions = async (pid?: string) =>
      (await c.req('GET', `/api/v1/fonctions${pid ? `?profil=${pid}` : ''}`, P)).json()
        .fonctions as Record<string, boolean>;
    // défaut : « off »
    expect((await c.req('GET', '/api/v1/admin/acces', A)).json().acces.qf_profils_enfants).toBe(
      'off',
    );
    const e = await fonctions(kid);
    expect([e.recitateurs_en_ligne, e.mushaf_exact]).toEqual([false, false]);
    const a1 = await fonctions(teen);
    expect([a1.recitateurs_en_ligne, a1.mushaf_exact]).toEqual([true, true]); // ados inchangés
    const p0 = await fonctions();
    expect([p0.recitateurs_en_ligne, p0.mushaf_exact]).toEqual([true, true]); // parent sans profil : inchangé
    // le serveur refuse aussi (garde exigeFonction), pour l'enfant seulement
    const refus = await c.req('GET', '/api/v1/quran/mushaf-exact/pages/1', {
      ...P,
      'x-profil': kid,
    });
    expect(refus.statusCode).toBe(403);
    expect(refus.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'mushaf_exact' });
    expect(
      (await c.req('GET', '/api/v1/quran/mushaf-exact/pages/1', { ...P, 'x-profil': teen }))
        .statusCode,
    ).not.toBe(403);
    // réglage depuis l'espace administrateur (effet immédiat), puis retour arrière
    expect((await reglage({ qf_profils_enfants: 'on' })).json().acces.qf_profils_enfants).toBe(
      'on',
    );
    const e2 = await fonctions(kid);
    expect([e2.recitateurs_en_ligne, e2.mushaf_exact]).toEqual([true, true]);
    expect(
      (await c.req('GET', '/api/v1/quran/mushaf-exact/pages/1', { ...P, 'x-profil': kid }))
        .statusCode,
    ).not.toBe(403);
    await reglage({ qf_profils_enfants: 'off' });
    expect((await fonctions(kid)).mushaf_exact).toBe(false);
    expect((await reglage({ qf_profils_enfants: 'peut-être' })).statusCode).toBe(400);
  });

  it('un seul réglage « mode » commute les trois modes, sans redéploiement, et se relit', async () => {
    expect(await statut()).toMatchObject({ mode: 'ouvert', inscription: 'ouverte' });
    expect((await reglage({ mode: 'invitation' })).json().acces).toMatchObject({
      mode: 'invitation',
      site: 'ouvert',
    });
    expect(await statut()).toMatchObject({
      mode: 'invitation',
      inscription: 'invitation',
      site: 'ouvert',
    });
    expect((await signup(addr())).json().error.code).toBe('invitation_requise');
    expect((await reglage({ mode: 'ferme' })).json().acces).toMatchObject({ mode: 'ferme' });
    const f = await signup(addr());
    expect(f.statusCode).toBe(503);
    expect(f.json().error.code).toBe('acces_ferme');
    expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(503);
    expect((await reglage({ mode: 'ouvert' })).json().acces).toMatchObject({ mode: 'ouvert' });
    expect((await c.req('GET', '/api/v1/levels')).statusCode).toBe(200);
    expect((await signup(addr())).statusCode).toBe(201);
    expect((await reglage({ mode: 'inconnu' })).statusCode).toBe(400);
  });

  it('retour arrière : fermer puis rouvrir remet le mode d’avant (invitation reste invitation)', async () => {
    await reglage({ mode: 'invitation' });
    await reglage({ mode: 'ferme' });
    expect((await statut()).mode).toBe('ferme');
    // l’inscription choisie avant la fermeture est conservée : on rouvre en « invitation » par le réglage « site »
    await reglage({ site: 'ouvert' });
    expect(await statut()).toMatchObject({ mode: 'invitation', inscription: 'invitation' });
    await reglage({ mode: 'ouvert' });
  });

  it('plafond du mode ouvert : plein, l’inscription libre passe en liste d’attente ; une invitation reste valable', async () => {
    const deja = await comptes();
    await reglage({ mode: 'ouvert', plafond: deja + 2 });
    expect(await statut()).toMatchObject({ inscription: 'ouverte' });
    expect((await signup(addr('p'))).statusCode).toBe(201);
    expect(await statut()).toMatchObject({ mode: 'ouvert', inscription: 'ouverte' });
    expect((await signup(addr('p'))).statusCode).toBe(201);
    // plafond atteint : « attente » (le mode reste « ouvert », c’est l’inscription offerte qui change)
    expect(await statut()).toMatchObject({ mode: 'ouvert', inscription: 'attente' });
    const plein = await signup(addr('p'));
    expect(plein.statusCode).toBe(403);
    expect(plein.json().error.code).toBe('plafond_atteint');
    // une invitation valable passe malgré le plafond
    const inv = (await c.req('POST', '/api/v1/admin/invitations', A, { max: 1 })).json();
    expect((await signup(addr('p'), { invitation: inv.code })).statusCode).toBe(201);
    // la liste d’attente reçoit les demandes ; l’administrateur accepte
    const mail1 = addr('att');
    expect(
      (await c.req('POST', '/api/v1/acces/liste-attente', {}, { email: mail1, consentement: true }))
        .statusCode,
    ).toBe(202);
    // relever le plafond rouvre l’inscription libre aussitôt (retour arrière)
    await reglage({ plafond: (await comptes()) + 5 });
    expect(await statut()).toMatchObject({ inscription: 'ouverte' });
    expect((await signup(addr('p'))).statusCode).toBe(201);
    // un compte supprimé libère une place
    await reglage({ plafond: await comptes() });
    expect((await statut()).inscription).toBe('attente');
    const [vieux] = await c.h.pool
      .query("select id from account where email like 'p%@exemple.org' limit 1")
      .then((r) => r.rows);
    await c.h.db
      .update(t.account)
      .set({ deletedAt: new Date(), email: null })
      .where(eq(t.account.id, vieux.id));
    invalidateAcces();
    expect((await statut()).inscription).toBe('ouverte');
    await reglage({ plafond: 200 });
  });

  it('le plafond est toujours un nombre : réglable de 0 (liste d’attente pour tous) à 1 000 000, jamais « sans limite »', async () => {
    await reglage({ plafond: 0 });
    expect((await statut()).inscription).toBe('attente');
    expect((await signup(addr())).json().error.code).toBe('plafond_atteint');
    expect((await reglage({ plafond: -1 })).statusCode).toBe(400);
    expect((await reglage({ plafond: 'illimité' })).statusCode).toBe(400);
    expect((await reglage({ plafond: 5_000_000 })).statusCode).toBe(400);
    await reglage({ plafond: 200 });
    expect((await statut()).inscription).toBe('ouverte');
  });

  it('anti-robots : jeton signé, délai minimal et champ piège (réglage « antibot »)', async () => {
    await reglage({ antibot: 'on' });
    expect((await statut()).antibot).toBe('on');
    // sans jeton
    const sans = await signup(addr());
    expect(sans.statusCode).toBe(400);
    expect(sans.json().error).toMatchObject({ code: 'antibot_echec', raison: 'absent' });
    // jeton émis à l'instant : trop rapide
    const j = (await c.req('GET', '/api/v1/acces/jeton')).json().jeton as string;
    expect((await signup(addr(), { jeton: j })).json().error.raison).toBe('trop_rapide');
    // jeton assez ancien (émis il y a 10 s, avec la même clé : on le fabrique par la base de temps du jeton)
    const vieux = `${Date.now() - 10_000}.x`;
    expect((await signup(addr(), { jeton: vieux })).json().error.raison).toBe('invalide');
    // le jeton émis plus tôt passe après 3 s ; le champ piège rempli est refusé même avec un bon jeton
    await new Promise((r) => setTimeout(r, ANTIBOT_MIN_MS + 200));
    const piege = await signup(addr(), { jeton: j, site_web: 'http://spam.example' });
    expect(piege.json().error.raison).toBe('piege');
    expect((await signup(addr(), { jeton: j })).statusCode).toBe(201);
    // la liste d'attente (page d'accueil publique) a les mêmes protections : jeton signé, délai minimal, champ piège
    const att = (extra: Record<string, unknown> = {}) =>
      c.req(
        'POST',
        '/api/v1/acces/liste-attente',
        {},
        { email: addr('att'), consentement: true, ...extra },
      );
    expect((await att()).json().error).toMatchObject({ code: 'antibot_echec', raison: 'absent' });
    const jt = (await c.req('GET', '/api/v1/acces/jeton')).json().jeton as string;
    expect((await att({ jeton: jt })).json().error.raison).toBe('trop_rapide');
    await new Promise((r) => setTimeout(r, ANTIBOT_MIN_MS + 200));
    expect((await att({ jeton: jt, site_web: 'http://spam.example' })).json().error.raison).toBe(
      'piege',
    );
    expect((await att({ jeton: jt })).statusCode).toBe(202);
    await reglage({ antibot: 'off' });
    expect((await att()).statusCode).toBe(202); // protection coupée : comme avant
    expect((await signup(addr())).statusCode).toBe(201);
  });

  it('vérification de l’adresse avant activation : « requise » ferme l’API aux comptes non vérifiés', async () => {
    await reglage({ verification: 'requise' });
    expect((await statut()).verification).toBe('requise');
    const email = addr('v');
    const r = await signup(email);
    expect(r.statusCode).toBe(201);
    const U = { cookie: cookieOf(r) };
    // l’e-mail de vérification est parti ; tant que l’adresse n’est pas vérifiée, l’API répond 403
    await new Promise((res) => setTimeout(res, 300));
    expect(mail.sent.some((m) => m.to === email && m.kind === 'verification')).toBe(true);
    const bloque = await c.req('GET', '/api/v1/levels', U);
    expect(bloque.statusCode).toBe(403);
    expect(bloque.json().error.code).toBe('email_non_verifie');
    // restent ouverts : le compte, la vérification (renvoi), la déconnexion, la santé
    expect((await c.req('GET', '/api/v1/auth/me', U)).statusCode).toBe(200);
    expect((await c.req('POST', '/api/v1/auth/email/verify/resend', U, {})).statusCode).toBe(202);
    expect((await c.req('GET', '/api/v1/health')).statusCode).toBe(200);
    // adresse vérifiée → l’application s’ouvre
    await c.h.db
      .update(t.account)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(t.account.email, email));
    await new Promise((res) => setTimeout(res, 50));
    expect((await c.req('GET', '/api/v1/levels', U)).statusCode).toBe(200);
    // retour arrière : « souple » rouvre aussi les comptes non vérifiés
    const r2 = await signup(addr('v'));
    const U2 = { cookie: cookieOf(r2) };
    expect((await c.req('GET', '/api/v1/levels', U2)).statusCode).toBe(403);
    await reglage({ verification: 'souple' });
    expect((await c.req('GET', '/api/v1/levels', U2)).statusCode).toBe(200);
  });

  it('tableau de bord : comptes, plafond, coût estimé du jour, plafonds de consommation et alertes', async () => {
    // comptes de remplissage jusqu'à 19 : un plafond de 20 donne 95 % (« proche »), 20 comptes donnent « atteint »
    for (let i = await comptes(); i < 19; i++)
      await c.h.pool.query(
        "insert into account (kind, email, password_hash, country) values ('adulte', $1, 'x', 'FR')",
        [`remplissage${i}@exemple.org`],
      );
    await reglage({ mode: 'ouvert', plafond: 20, verification: 'souple' });
    const d = (await c.req('GET', '/api/v1/admin/tableau', A)).json();
    expect(d.mode).toBe('ouvert');
    expect(d.comptes.total).toBe(await comptes());
    expect(d.comptes.parents + d.comptes.adultes).toBe(d.comptes.total);
    expect(d.comptes.plafond).toBe(20);
    expect(d.comptes.pourcentPlafond).toBeGreaterThan(0);
    expect(d.couts).toMatchObject({ tuteurUsd: 0, tuteurQuestions: 0, fixeJourEur: 2 });
    expect(d.couts.estimeJourEur).toBe(2);
    expect(d.couts.seuilAlerteEur).toBe(4);
    expect(d.couts.fonctionsCoupees).toBe(false);
    expect(d.plafonds.map((p: { cle: string }) => p.cle)).toEqual([
      'tuteur',
      'ecoute',
      'voix',
      'stockage',
      'avis',
    ]);
    // 90 % du plafond et plus : alerte « plafond_proche » ; plein : « plafond_atteint »
    expect(d.alertes.map((a: { code: string }) => a.code)).toContain('plafond_proche');
    await signup(addr('t'));
    const plein = (await c.req('GET', '/api/v1/admin/tableau', A)).json();
    expect(plein.alertes.map((a: { code: string }) => a.code)).toContain('plafond_atteint');
    // une demande en liste d'attente : alerte d'information
    await c.req(
      'POST',
      '/api/v1/acces/liste-attente',
      {},
      { email: addr('al'), consentement: true },
    );
    // (double consentement : seule une adresse confirmée par e-mail compte dans le tableau)
    await c.h.pool.query('update waitlist set confirmed_at = now() where confirmed_at is null');
    const att = (await c.req('GET', '/api/v1/admin/tableau', A)).json();
    expect(att.attente.enAttente).toBeGreaterThan(0);
    expect(att.alertes.map((a: { code: string }) => a.code)).toContain('attente');
    // le site fermé est signalé
    await reglage({ mode: 'ferme' });
    expect(
      (await c.req('GET', '/api/v1/admin/tableau', A))
        .json()
        .alertes.map((a: { code: string }) => a.code),
    ).toContain('site_ferme');
    await reglage({ mode: 'ouvert', plafond: 200 });
    // réservé à l'administrateur
    expect((await c.req('GET', '/api/v1/admin/tableau')).statusCode).toBe(401);
  });

  it('coût du jour : la dépense du tuteur s’ajoute au coût fixe et déclenche l’alerte au-delà du seuil', async () => {
    const [acc] = await c.h.pool
      .query("select id from account where kind = 'adulte' limit 1")
      .then((r) => r.rows);
    const [pro] = await c.h.pool
      .query('select id from profile where owner_account_id = $1 limit 1', [acc.id])
      .then((r) => r.rows);
    await c.h.pool.query(
      `insert into tutor_log (profile_id, role_id, role_version, provider, action, decision, route, cost_micros)
       values ($1, 'r', '1', 'simule', 'repondre', 'ok', 'local', 4000000)`,
      [pro.id],
    );
    const d = (await c.req('GET', '/api/v1/admin/tableau', A)).json();
    expect(d.couts.tuteurUsd).toBe(4);
    expect(d.couts.tuteurQuestions).toBe(1);
    // 2 € fixes + 4 $ × 0,92 = 5,68 € : au-dessus du seuil de 4 € par jour
    expect(d.couts.estimeJourEur).toBe(5.68);
    expect(d.alertes.map((a: { code: string }) => a.code)).toContain('cout_jour_eleve');
  });
});
