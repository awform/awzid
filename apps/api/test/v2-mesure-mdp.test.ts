/**
 * V2-0 et V2-1 (29/10/2026) — mots de passe simples de 8 caractères avec messages clairs, et mesure anonyme.
 *  - 8 caractères sans complexité ; refus des mots courants (liste locale) et des mots égaux à l'e-mail / prénom ;
 *  - connexion : essais restants, 8 essais puis pause de 10 minutes avec son heure de fin, pause levée par le
 *    changement du mot de passe, personnel inchangé (5 essais, pause progressive) ;
 *  - mots de passe existants restés valables ;
 *  - mesure : compteurs par heure sans aucune donnée personnelle, 90 jours, entonnoir 7 et 30 jours.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  FUNNEL_JOURS,
  funnelReport,
  heureArrondie,
  purgeFunnel,
  purgeRetention,
  recordFunnel,
  schema as t,
} from '@awform/db';
import { hashSecret } from '../src/auth/crypto.js';
import { PW, setupEdition, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('V2-1 : mots de passe simples et verrou de connexion', () => {
  let c: Ctx;
  let n = 0;
  const addr = () => `v2-${++n}-${Math.random().toString(36).slice(2, 7)}@exemple.org`;
  beforeAll(async () => {
    c = await setupEdition(URL!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

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
  const login = (email: string, password: string, ip = '192.0.2.50') =>
    c.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: ip,
      headers: { 'x-awform': '1' },
      payload: { email, password },
    });

  it('inscription : 8 caractères sans complexité acceptés, 7 refusés', async () => {
    expect((await signup(addr(), { password: 'tamarini' })).statusCode).toBe(201);
    const court = await signup(addr(), { password: 'tamarin' });
    expect(court.statusCode).toBe(400);
    expect(court.json().error.code).toBe('mot_de_passe_trop_court');
  });

  it('inscription : refus d’un mot de passe courant de la liste locale, et d’un mot égal à l’e-mail ou au prénom', async () => {
    // « dakar2026 » n'est pas dans la courte liste du code : il vient de la grande liste locale
    const courant = await signup(addr(), { password: 'dakar2026' });
    expect(courant.statusCode).toBe(400);
    expect(courant.json().error.code).toBe('mot_de_passe_trop_courant');
    const email = addr();
    const egalMail = await signup(email, { password: email });
    expect(egalMail.json().error.code).toBe('mot_de_passe_egal_identifiant');
    const egalLocal = await signup(email, { password: email.split('@')[0]!.toUpperCase() });
    expect(egalLocal.json().error.code).toBe('mot_de_passe_egal_identifiant');
    const egalPrenom = await signup(addr(), { password: 'Zaynabou', pseudonym: 'zaynabou' });
    expect(egalPrenom.json().error.code).toBe('mot_de_passe_egal_identifiant');
    // seulement « égal » : le prénom dans un mot de passe plus long reste accepté
    expect(
      (await signup(addr(), { password: 'zaynabou-2026', pseudonym: 'zaynabou' })).statusCode,
    ).toBe(201);
  });

  it('un mot de passe déjà créé (plus court ou « simple ») reste valable à la connexion', async () => {
    const email = addr();
    await c.h.db.insert(t.account).values({
      kind: 'adulte',
      email,
      passwordHash: await hashSecret('abc'),
      passwordChangedAt: new Date(),
      country: 'FR',
    });
    expect((await login(email, 'abc', '192.0.2.51')).statusCode).toBe(200);
  });

  it('essais restants, 8 essais puis pause de 10 minutes avec son heure de fin', async () => {
    const email = addr();
    expect((await signup(email)).statusCode).toBe(201);
    const ip = '192.0.2.52';
    const restants: number[] = [];
    for (let k = 0; k < 7; k++) {
      const r = await login(email, 'mauvais mot de passe', ip);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe('identifiants_incorrects');
      restants.push(r.json().error.essais_restants);
    }
    expect(restants).toEqual([7, 6, 5, 4, 3, 2, 1]);
    const avant = Date.now();
    const huitieme = await login(email, 'mauvais mot de passe', ip);
    expect(huitieme.statusCode).toBe(429);
    const e = huitieme.json().error;
    expect(e.code).toBe('verrouille');
    expect(e.pause_minutes).toBe(10);
    const fin = new Date(e.jusqua).getTime();
    expect(fin - avant).toBeGreaterThan(9.5 * 60_000);
    expect(fin - avant).toBeLessThan(10.5 * 60_000);
    // pendant la pause, même le bon mot de passe est refusé, avec la même heure de fin
    const bon = await login(email, PW, ip);
    expect(bon.statusCode).toBe(429);
    expect(bon.json().error.jusqua).toBe(e.jusqua);
    // une autre adresse n'est pas touchée
    expect((await login(email, PW, '192.0.2.53')).statusCode).toBe(200);
  });

  it('même réponse (essais restants) que le compte existe ou non', async () => {
    const ip = '192.0.2.54';
    const a = await login(addr(), 'faux faux faux', ip);
    const b = await login(addr(), 'faux faux faux', ip);
    expect(a.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    expect(a.json().error.essais_restants).toBe(7);
  });

  it('la pause est levée quand le mot de passe est changé', async () => {
    const email = addr();
    expect((await signup(email)).statusCode).toBe(201);
    const ip = '192.0.2.55';
    for (let k = 0; k < 8; k++) await login(email, 'mauvais mot de passe', ip);
    expect((await login(email, PW, ip)).statusCode).toBe(429);
    // changement depuis un autre appareil (autre adresse)
    const ok = await login(email, PW, '192.0.2.56');
    expect(ok.statusCode).toBe(200);
    const cookie = String([ok.headers['set-cookie']].flat()[0] ?? '').split(';')[0]!;
    const NEW = 'nouveau mot de passe simple';
    const ch = await c.req('POST', '/api/v1/auth/password', { cookie }, { current: PW, next: NEW });
    expect(ch.statusCode).toBe(200);
    // sur l'adresse bloquée : l'ancien mot de passe n'ouvre rien, le nouveau passe tout de suite
    const encore = await login(email, NEW, ip);
    expect(encore.statusCode).toBe(200);
  });

  it('après réinitialisation en base (mot de passe oublié), la pause est levée', async () => {
    const email = addr();
    expect((await signup(email)).statusCode).toBe(201);
    const ip = '192.0.2.57';
    for (let k = 0; k < 8; k++) await login(email, 'mauvais mot de passe', ip);
    expect((await login(email, PW, ip)).statusCode).toBe(429);
    await c.h.db
      .update(t.account)
      .set({ passwordHash: await hashSecret('reinitialise 2026'), passwordChangedAt: new Date() })
      .where(eq(t.account.email, email));
    expect((await login(email, 'reinitialise 2026', ip)).statusCode).toBe(200);
  });

  it('personnel inchangé : 5 essais, pause progressive (1 minute), pas de pause fixe', async () => {
    const email = addr();
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email,
      passwordHash: await hashSecret(PW),
      passwordChangedAt: new Date(),
      country: 'FR',
    });
    const ip = '192.0.2.58';
    for (let k = 0; k < 4; k++) {
      const r = await login(email, 'mauvais mot de passe', ip);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.essais_restants).toBe(4 - k);
    }
    const cinquieme = await login(email, 'mauvais mot de passe', ip);
    expect(cinquieme.statusCode).toBe(429);
    expect(cinquieme.json().error.pause_minutes).toBeUndefined();
    const duree = new Date(cinquieme.json().error.jusqua).getTime() - Date.now();
    expect(duree).toBeLessThan(2 * 60_000);
    // règle du personnel : 12 caractères au moins pour un nouveau mot de passe
    const [a] = await c.h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, email));
    expect(a).toBeTruthy();
  });
});

describe.skipIf(!URL)('V2-0 : mesure anonyme', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });
  const mesure = (etape: string, plateforme = 'mobile', langue = 'fr') =>
    c.req('POST', '/api/v1/mesure', {}, { etape, plateforme, langue });

  it('la table ne garde que l’étape, l’heure arrondie, la plateforme, la langue et un compteur', async () => {
    const r = await c.h.pool.query(
      "select column_name from information_schema.columns where table_name = 'funnel_event' order by column_name",
    );
    expect(r.rows.map((x) => x.column_name)).toEqual(['hour', 'locale', 'n', 'platform', 'step']);
  });

  it('POST /mesure : 204, étape inconnue refusée, champs en trop refusés ; aucune adresse IP gardée', async () => {
    expect((await mesure('inscription_ouverte')).statusCode).toBe(204);
    expect((await mesure('inscription_ouverte', 'bureau', 'ar')).statusCode).toBe(204);
    expect((await mesure('etape_inconnue')).statusCode).toBe(400);
    expect((await mesure('inscription_ouverte', 'telephone')).statusCode).toBe(400);
    // un champ en trop (adresse e-mail) est écarté avant tout traitement : il n'arrive jamais jusqu'à la base
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/mesure',
          {},
          { etape: 'inscription_ouverte', plateforme: 'mobile', langue: 'fr', email: 'x@y.org' },
        )
      ).statusCode,
    ).toBe(204);
    const rows = await c.h.db.select().from(t.funnelEvent);
    const texte = JSON.stringify(rows);
    expect(texte).not.toMatch(/127\.0\.0\.1|::1|@|192\.0\.2/);
    for (const r of rows) {
      expect(r.hour.getTime() % 3600_000).toBe(0);
      expect(Object.keys(r).sort()).toEqual(['hour', 'locale', 'n', 'platform', 'step']);
    }
  });

  it('compteurs agrégés par heure : deux événements identiques = une ligne à 2', async () => {
    const now = new Date('2026-10-29T10:42:17Z');
    await recordFunnel(c.h.db, 'connexion_ouverte', 'mobile', 'fr', now);
    await recordFunnel(
      c.h.db,
      'connexion_ouverte',
      'mobile',
      'fr',
      new Date('2026-10-29T10:59:59Z'),
    );
    const [l] = await c.h.db
      .select()
      .from(t.funnelEvent)
      .where(eq(t.funnelEvent.hour, heureArrondie(now)));
    expect(l!.n).toBe(2);
    expect(l!.hour.toISOString()).toBe('2026-10-29T10:00:00.000Z');
    expect(await recordFunnel(c.h.db, 'pas_une_etape', 'mobile', 'fr', now)).toBe(false);
  });

  it('entonnoir sur 7 et 30 jours : nombre et pourcentage à chaque étape', async () => {
    await c.h.pool.query('delete from funnel_event');
    const now = new Date('2026-10-29T12:00:00Z');
    const ajout = async (etape: string, fois: number, joursAvant: number) => {
      for (let i = 0; i < fois; i++)
        await recordFunnel(
          c.h.db,
          etape,
          'mobile',
          'fr',
          new Date(now.getTime() - joursAvant * 86400_000),
        );
    };
    await ajout('inscription_ouverte', 10, 1);
    await ajout('inscription_choix', 8, 1);
    await ajout('inscription_identifiants', 5, 1);
    await ajout('inscription_mdp_valide', 4, 1);
    await ajout('inscription_compte_cree', 2, 1);
    await ajout('inscription_ouverte', 10, 20); // hors des 7 jours, dans les 30
    await ajout('connexion_ouverte', 20, 2);
    await ajout('connexion_identifiants', 10, 2);
    await ajout('connexion_reussie', 8, 2);
    await ajout('connexion_echec_mdp', 3, 2);
    await ajout('connexion_blocage', 1, 2);
    const s7 = await funnelReport(c.h.db, 7, now);
    expect(s7.inscription.map((l) => [l.etape, l.n, l.pourcent])).toEqual([
      ['inscription_ouverte', 10, 100],
      ['inscription_choix', 8, 80],
      ['inscription_identifiants', 5, 50],
      ['inscription_mdp_valide', 4, 40],
      ['inscription_compte_cree', 2, 20],
    ]);
    expect(s7.connexion.map((l) => [l.etape, l.n, l.pourcent, l.cote])).toEqual([
      ['connexion_ouverte', 20, 100, false],
      ['connexion_identifiants', 10, 50, false],
      ['connexion_reussie', 8, 40, false],
      ['connexion_echec_mdp', 3, 15, true],
      ['connexion_blocage', 1, 5, true],
    ]);
    const s30 = await funnelReport(c.h.db, 30, now);
    expect(s30.inscription[0]).toMatchObject({ n: 20, pourcent: 100 });
    expect(s30.inscription[4]).toMatchObject({ n: 2, pourcent: 10 });
  });

  it('effacement automatique après 90 jours (par le travailleur de nuit)', async () => {
    await c.h.pool.query('delete from funnel_event');
    const now = new Date('2026-10-29T12:00:00Z');
    await recordFunnel(
      c.h.db,
      'connexion_ouverte',
      'bureau',
      'en',
      new Date(now.getTime() - 91 * 86400_000),
    );
    await recordFunnel(
      c.h.db,
      'connexion_ouverte',
      'bureau',
      'en',
      new Date(now.getTime() - 89 * 86400_000),
    );
    expect(FUNNEL_JOURS).toBe(90);
    const r = await purgeRetention(c.h.db, now);
    expect(r.mesure).toBe(1);
    expect(await purgeFunnel(c.h.db, now)).toBe(0);
    expect(await c.h.db.select().from(t.funnelEvent)).toHaveLength(1);
  });

  it('tableau de l’admin : réservé (401 sans session, 403 pour une famille)', async () => {
    expect((await c.req('GET', '/api/v1/admin/entonnoir')).statusCode).toBe(401);
    const s = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'mesure-fam@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        birthYear: YEAR - 30,
        pseudonym: 'Moi',
      },
    );
    const cookie = String([s.headers['set-cookie']].flat()[0] ?? '').split(';')[0]!;
    expect((await c.req('GET', '/api/v1/admin/entonnoir', { cookie })).statusCode).toBe(403);
  });
});
