/**
 * Mode « tout voir » du client (2/11/2026) — API, base de test :
 *  - `GET /auth/me` renvoie `toutVoir: true` au SEUL compte `admin` dont le second facteur est validé dans la session ;
 *  - jamais sans second facteur (jamais configuré, ou session à moitié ouverte), ni pour la bêta fermée, un adulte, un
 *    parent, un enseignant (même avec son second facteur), un enfant ou un élève d'école en session limitée ;
 *  - le compte « tout voir » n'obtient AUCUNE donnée d'élève ni de famille : les routes par profil lui sont fermées, et il
 *    n'a pas de profil (l'exploration se fait sans profil, donc sans rien écrire).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t, setFlagState } from '@awform/db';
import { COMPTE_TOUT_VOIR, voitTout } from '../src/auth/tout-voir.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { creerLot, connexion } from './eleves-aide.js';
import {
  adult,
  child,
  cookieOf,
  newClass,
  parent,
  PW,
  setup,
  teacher,
  YEAR,
  type Ctx,
} from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;
type Moi = {
  toutVoir?: boolean;
  mfaVerified?: boolean;
  mfaRequired?: boolean;
  profiles: unknown[];
};

describe('critère « tout voir » (sans base)', () => {
  const base = {
    id: COMPTE_TOUT_VOIR,
    kind: 'admin',
    email: 'client@exemple.org',
    mfaVerified: true,
    totpEnabled: true,
    limitee: false,
  };
  it('le client SEUL : un autre identifiant (même administrateur avec second facteur) n’a pas « tout voir »', () => {
    expect(COMPTE_TOUT_VOIR).toBe('01a14091-7673-776c-9993-d46fd1265aa7');
    for (const id of ['00000000-0000-7000-8000-000000000001', '', null, undefined])
      expect(voitTout({ ...base, id }), String(id)).toBe(false);
  });
  it('administrateur de démonstration : jamais, même avec le bon identifiant', () => {
    for (const email of ['admin-x7k@demo.awform.test', 'A@DEMO.AWFORM.TEST'])
      expect(voitTout({ ...base, email }), email).toBe(false);
    expect(voitTout({ ...base, email: null })).toBe(true);
  });
  it('administrateur + second facteur activé et validé + session non limitée : oui, rien d’autre', () => {
    expect(voitTout(base)).toBe(true);
    expect(voitTout({ ...base, mfaVerified: false })).toBe(false);
    expect(voitTout({ ...base, totpEnabled: false })).toBe(false);
    expect(voitTout({ ...base, limitee: true })).toBe(false);
    for (const kind of [
      'parent',
      'adulte',
      'enseignant',
      'ecole',
      'beta_fermee',
      '',
      'Admin',
      'ADMIN',
    ])
      expect(voitTout({ ...base, kind }), kind).toBe(false);
  });
});

describe.skipIf(!URL)('mode « tout voir » : /auth/me et données des élèves (awform_test)', () => {
  let c: Ctx;
  let A: H; // administrateur, second facteur validé
  let n = 0;
  const addr = (p: string) => `${p}${++n}@exemple.org`;
  const me = async (h: H) => (await c.req('GET', '/api/v1/auth/me', h)).json() as Moi;

  /** compte administrateur créé en base (comme la CLI), éventuellement avec le second facteur activé et validé */
  async function admin(email: string, avecTotp: boolean, id?: string) {
    await c.h.db.insert(t.account).values({
      ...(id ? { id } : {}),
      kind: 'admin',
      email,
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const login = await c.req('POST', '/api/v1/auth/login', {}, { email, password: PW });
    const H: H = { cookie: cookieOf(login) };
    let secret = '';
    if (avecTotp) {
      const s = (await c.req('POST', '/api/v1/auth/totp/setup', H, {})).json();
      secret = s.secret as string;
      await c.req('POST', '/api/v1/auth/totp/confirm', H, {
        code: totpAt(secret, Math.floor(Date.now() / 30_000)),
      });
    }
    return { H, secret };
  }

  beforeAll(async () => {
    c = await setup(URL!);
    A = (await admin('tout.voir@exemple.org', true, COMPTE_TOUT_VOIR)).H;
  }, 60_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('administrateur avec second facteur validé : toutVoir vrai, aucun profil, e-mail masqué', async () => {
    const m = await me(A);
    expect(m.toutVoir).toBe(true);
    expect(m.mfaVerified).toBe(true);
    expect(m.profiles).toEqual([]);
    const brut = (await c.req('GET', '/api/v1/auth/me', A)).body;
    expect(brut).not.toContain('tout.voir@exemple.org');
  });

  it('un AUTRE administrateur avec second facteur validé : jamais « tout voir »', async () => {
    const { H } = await admin('autre.admin@exemple.org', true);
    const m = await me(H);
    expect(m.mfaVerified).toBe(true);
    expect(m.toutVoir).toBe(false);
    const ov = await c.req('GET', '/api/v1/admin/overview', H);
    expect(ov.statusCode).toBe(200); // l'administration ordinaire reste ouverte
  });

  it('administrateur de démonstration (adresse @demo.awform.test, session de démo) : jamais', async () => {
    const { H } = await admin('admin-t9k@demo.awform.test', true);
    const m = await me(H);
    expect(m.mfaVerified).toBe(true);
    expect(m.toutVoir).toBe(false);
  });

  it('administrateur SANS second facteur : jamais', async () => {
    const { H } = await admin('sans.totp@exemple.org', false);
    const m = await me(H);
    expect(m.toutVoir).toBe(false);
    expect(m.mfaVerified).toBe(false);
  });

  it('administrateur dont le second facteur est activé mais PAS validé dans cette session : jamais', async () => {
    const e = 'totp.attente@exemple.org';
    const { H } = await admin(e, true);
    expect((await me(H)).mfaVerified).toBe(true);
    // session à moitié ouverte (ouverte par un autre moyen que le mot de passe + code, ou second facteur non rejoué) :
    // le second facteur est activé sur le compte mais n'est pas validé dans CETTE session
    await c.h.pool.query(
      'update session set mfa_verified = false where account_id = (select id from account where email = $1)',
      [e],
    );
    const m = await me(H);
    expect(m.mfaRequired).toBe(true);
    expect(m.mfaVerified).toBe(false);
    expect(m.toutVoir).toBe(false);
  });

  it('visiteur sans session : aucune réponse « tout voir »', async () => {
    const r = await c.req('GET', '/api/v1/auth/me?doux=1', {});
    expect(r.json()).toEqual({ anonyme: true });
    expect((await c.req('GET', '/api/v1/auth/me', {})).statusCode).toBe(401);
  });

  it('bêta fermée, adulte, parent, enseignant (second facteur validé), enfant, élève d’école : jamais', async () => {
    await setFlagState(c.h.db, 'beta_contenu_differe_visible', 'on', null);
    // bêta fermée : adulte ajouté au groupe par l'administrateur
    const emailBeta = addr('beta');
    const beta = await adult(c, emailBeta);
    const ajout = await c.req('POST', '/api/v1/admin/groupe-beta', A, { adresse: emailBeta });
    expect([200, 201]).toContain(ajout.statusCode);
    const mb = (await c.req('GET', '/api/v1/auth/me', beta.A)).json() as Moi & { roles: string[] };
    expect(mb.roles).toContain('beta_fermee');
    expect(mb.toutVoir).toBe(false);

    const ad = await adult(c, addr('adulte'));
    expect((await me(ad.A)).toutVoir).toBe(false);

    const { P } = await parent(c, addr('parent'));
    expect((await me(P)).toutVoir).toBe(false);

    const T = await teacher(c, addr('prof'));
    const mt = await me(T);
    expect(mt.mfaVerified).toBe(true);
    expect(mt.toutVoir).toBe(false);

    // enfant d'un parent, avec identifiant : session limitée à son profil
    const { P: P2, pin } = await parent(c, addr('parent2'));
    const pid = await child(c, P2, 'Lina');
    expect(pid).toBeTruthy();
    const acces = await c.req('POST', '/api/v1/profiles', pin, {
      pseudonym: 'Samir',
      birthYear: YEAR - 9,
      levelCode: 'en1',
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
      identifiant: 'samir-217',
      motDePasseEnfant: 'soleil-vert-42',
      declaration: true,
    });
    expect(acces.statusCode, acces.body).toBe(201);
    const en = await connexion(c, 'samir-217', 'soleil-vert-42');
    const men = (await c.req('GET', '/api/v1/auth/me', en.E)).json() as Moi;
    expect((men as { enfantSession?: boolean }).enfantSession).toBe(true);
    expect(men.toutVoir).not.toBe(true);

    // élève d'une classe : créé par l'enseignant, session limitée
    const classe = await newClass(c, T, 'CE2');
    const lot = await creerLot(c, T, classe.id, [{ prenom: 'Awa', annee: YEAR - 9 }]);
    expect(lot.statusCode, lot.body).toBe(201);
    const eleve = lot.json().eleves[0] as { identifiant: string; motDePasse: string };
    const el = await connexion(c, eleve.identifiant, eleve.motDePasse);
    const mel = (await c.req('GET', '/api/v1/auth/me', el.E)).json() as Moi;
    expect((mel as { enfantSession?: boolean }).enfantSession).toBe(true);
    expect(mel.toutVoir).not.toBe(true);
  }, 120_000);

  it('non-régression : le compte « tout voir » ne reçoit aucune donnée d’élève ni de famille', async () => {
    const { P } = await parent(c, addr('famille'));
    const pid = await child(c, P, 'Zainab-Secrete');
    const routes = [
      `/api/v1/profiles/${pid}/accueil`,
      `/api/v1/profiles/${pid}/parcours`,
      `/api/v1/profiles/${pid}/madjaliss`,
      `/api/v1/today/${pid}?today=2026-11-02`,
      `/api/v1/dashboard/${pid}`,
      `/api/v1/progress?profile=${pid}&level=en1`,
      `/api/v1/hifz/profiles/${pid}`,
    ];
    // le propriétaire, lui, lit son profil : la route existe bien (sinon le test ne prouverait rien)
    const proprio = await c.req('GET', `/api/v1/dashboard/${pid}`, P);
    expect(proprio.statusCode).toBe(200);
    for (const u of routes) {
      const r = await c.req('GET', u, A);
      expect(r.statusCode, u).not.toBe(200);
      expect([401, 403, 404], u).toContain(r.statusCode);
      expect(r.body, u).not.toContain('Zainab-Secrete');
    }
    // profils et liste de l'administrateur : rien qui vienne d'une famille
    const mes = await c.req('GET', '/api/v1/profiles', A);
    expect(mes.json().profiles).toEqual([]);
    // la vue d'ensemble de l'administration masque les e-mails (pas de donnée personnelle en clair)
    const ov = await c.req('GET', '/api/v1/admin/overview', A);
    expect(ov.statusCode).toBe(200);
    expect(ov.body).not.toContain('Zainab-Secrete');
    expect(ov.body).not.toMatch(/famille\d+@exemple\.org/);
  }, 60_000);

  it('non-régression : le contenu public (niveaux) est identique pour l’administrateur et pour un élève ordinaire', async () => {
    const { P } = await parent(c, addr('compar'));
    const a = await c.req('GET', '/api/v1/levels', A);
    const p = await c.req('GET', '/api/v1/levels', P);
    expect(a.statusCode).toBe(200);
    expect(a.body).toBe(p.body);
    // /auth/me d'un compte ordinaire : le champ est présent et faux (jamais absent pour un compte de la plateforme)
    expect((await me(P)).toutVoir).toBe(false);
  });
});
