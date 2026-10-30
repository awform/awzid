/**
 * V2-3 (partie 1) — comptes des enfants avec identifiant : forme, session limitée, verrou, déblocage par le parent.
 */
import { randomBytes, randomUUID } from 'node:crypto';
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
import {
  autoriseEnfant,
  baseIdentifiant,
  estIdentifiantEnfant,
  propositions,
} from '../src/auth/enfant-login.js';
import { TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const PW = 'une longue phrase de passe 2026';
const PW_ENFANT = 'soleil-vert-42';
const YEAR = new Date().getUTCFullYear();

describe('identifiant d’enfant : forme et propositions (sans base)', () => {
  it('3 à 24 caractères [a-z0-9-], une lettre au moins, pas de tiret aux bords', () => {
    for (const ok of ['lina-482', 'abc', 'a-1', 'x'.repeat(24)])
      expect(estIdentifiantEnfant(ok), ok).toBe(true);
    for (const ko of [
      'ab',
      'x'.repeat(25),
      '-lina',
      'lina-',
      '123456',
      'Lina é',
      'li na',
      'a@b.fr',
      '+221771234567',
    ])
      expect(estIdentifiantEnfant(ko), ko).toBe(false);
  });
  it('« prénom-NNN » : accents retirés, trois propositions distinctes', () => {
    expect(baseIdentifiant('Aïcha')).toBe('aicha');
    expect(baseIdentifiant('Jean-Éric Ndiaye')).toBe('jean-eric-ndiaye');
    expect(baseIdentifiant('٣٣')).toBe('enfant');
    const p = propositions('Aïcha');
    expect(p).toHaveLength(3);
    expect(new Set(p).size).toBe(3);
    for (const x of p) expect(x).toMatch(/^aicha-\d{3}$/);
  });
});

describe('session limitée : liste fermée (sans base)', () => {
  const me = randomUUID();
  const autre = randomUUID();
  const ok = (m: string, u: string, corps?: unknown) => autoriseEnfant(m, u, me, corps);
  it('apprentissage et lecture publique : permis', () => {
    expect(ok('GET', '/api/v1/auth/me')).toBe(true);
    expect(ok('POST', '/api/v1/auth/logout')).toBe(true);
    expect(ok('GET', '/api/v1/levels')).toBe(true);
    expect(ok('GET', '/api/v1/quran/suras')).toBe(true);
    expect(ok('POST', '/api/v1/attempts', { profileId: me })).toBe(true);
    expect(ok('POST', '/api/v1/sync', { ops: [{ profileId: me }] })).toBe(true);
    expect(ok('GET', `/api/v1/profiles/${me}/accueil`)).toBe(true);
    expect(ok('GET', `/api/v1/profiles/${me}/parcours?x=1`)).toBe(true);
  });
  it('ajouts d’apprentissage de SON profil : permis, avec la bonne méthode', () => {
    expect(ok('GET', `/api/v1/today/${me}?today=2026-10-30`)).toBe(true);
    expect(ok('GET', `/api/v1/dashboard/${me}`)).toBe(true);
    expect(ok('GET', `/api/v1/hifz/profiles/${me}`)).toBe(true);
    expect(ok('GET', `/api/v1/hifz/profiles/${me}/marques`)).toBe(true);
    expect(ok('POST', '/api/v1/units/en1.l01/corriger', { answers: {} })).toBe(true);
    expect(ok('POST', `/api/v1/profiles/${me}/commencer/arabe`)).toBe(true);
    // comptage d'usage sans traceur : permis pour SON profil seulement
    expect(ok('POST', '/api/v1/usage', { profil: me, cles: ['accueil'] })).toBe(true);
    expect(ok('POST', '/api/v1/usage', { profil: autre, cles: ['accueil'] })).toBe(false);
    for (const sous of [
      'madjaliss',
      'vivre',
      'devoirs',
      'certificats',
      'hifz-classe',
      'mode-evaluation',
      'protections',
      'quran/allowed-reciters',
      'quran/reciters',
    ])
      expect(ok('GET', `/api/v1/profiles/${me}/${sous}`), sous).toBe(true);
    expect(ok('GET', `/api/v1/profiles/${me}/quran/suras/2/tracks`)).toBe(true);
  });
  it('les lectures ne deviennent pas des écritures, et rien ne passe sur un autre profil', () => {
    for (const sous of [
      'madjaliss',
      'devoirs',
      'certificats',
      'mode-evaluation',
      'protections',
      'quran/reciters',
    ])
      for (const m of ['POST', 'PUT', 'PATCH', 'DELETE'])
        expect(ok(m, `/api/v1/profiles/${me}/${sous}`), `${m} ${sous}`).toBe(false);
    expect(ok('POST', `/api/v1/today/${me}`)).toBe(false);
    expect(ok('PUT', `/api/v1/hifz/profiles/${me}/plan`)).toBe(false);
    expect(ok('GET', `/api/v1/today/${autre}`)).toBe(false);
    expect(ok('GET', `/api/v1/dashboard/${autre}`)).toBe(false);
    expect(ok('GET', `/api/v1/hifz/profiles/${autre}/marques`)).toBe(false);
    expect(ok('GET', `/api/v1/profiles/${autre}/madjaliss`)).toBe(false);
    expect(ok('PUT', '/api/v1/units/en1.l01/corriger')).toBe(false);
  });
  it('signalement par l’enfant ou l’ado : motifs prédéfinis, jamais de texte libre', () => {
    const base = { targetKind: 'lecon', unitId: 'en1.l01', path: 'x' };
    for (const reason of ['texte_arabe', 'orthographe', 'audio_absent', 'audio_faux', 'autre'])
      expect(ok('POST', '/api/v1/contenu/signalements', { ...base, reason }), reason).toBe(true);
    for (const reason of ['sens', 'reference', 'regle', 'corrige', 'inconnu'])
      expect(ok('POST', '/api/v1/contenu/signalements', { ...base, reason }), reason).toBe(false);
    expect(
      ok('POST', '/api/v1/contenu/signalements', { ...base, reason: 'autre', comment: 'bonjour' }),
    ).toBe(false);
    expect(
      ok('POST', '/api/v1/contenu/signalements', { ...base, reason: 'autre', excerpt: 'texte' }),
    ).toBe(false);
    expect(ok('POST', '/api/v1/contenu/signalements')).toBe(false);
    expect(ok('GET', '/api/v1/contenu/signalements')).toBe(false);
  });
  it('récitateur : seulement sur SON profil', () => {
    expect(ok('PUT', `/api/v1/profiles/${me}/quran/reciter`, { reciterId: null })).toBe(true);
    expect(ok('PUT', `/api/v1/profiles/${autre}/quran/reciter`, { reciterId: null })).toBe(false);
  });
  it('tuteur IA : l’ado avec l’accord parental seulement ; l’enfant jamais', () => {
    const rts: Array<[string, string]> = [
      ['POST', `/api/v1/tuteur-ia/${me}/libre`],
      ['POST', `/api/v1/tuteur-ia/${me}/guidee`],
      ['GET', `/api/v1/tuteur-ia/${me}/etat?unit=en1.l01`],
      ['POST', `/api/v1/tutor/${me}/ask`],
      ['GET', '/api/v1/tutor/status'],
    ];
    const av = (c: { ado: boolean; tuteurIa: boolean }) => (m: string, u: string) =>
      autoriseEnfant(m, u, me, undefined, undefined, c);
    for (const [m, u] of rts) {
      expect(av({ ado: true, tuteurIa: true })(m, u), `ado+accord ${u}`).toBe(true);
      expect(av({ ado: true, tuteurIa: false })(m, u), `ado sans accord ${u}`).toBe(false);
      expect(av({ ado: false, tuteurIa: true })(m, u), `enfant ${u}`).toBe(false);
      expect(av({ ado: false, tuteurIa: false })(m, u), `enfant sans accord ${u}`).toBe(false);
    }
    const okAdo = av({ ado: true, tuteurIa: true });
    expect(okAdo('POST', `/api/v1/tuteur-ia/${autre}/libre`)).toBe(false); // jamais le profil d'un autre
    expect(okAdo('POST', `/api/v1/tutor/${autre}/ask`)).toBe(false);
    expect(okAdo('POST', `/api/v1/tutor/${me}/journal/x/signaler`)).toBe(false);
  });
  it('écoute, récitation, tuteur, khatma, classes, messages, rapport : toujours refusés', () => {
    for (const [m, u] of [
      ['GET', `/api/v1/profiles/${me}/ecoute`],
      ['POST', `/api/v1/profiles/${me}/ecoute/accord`],
      ['POST', `/api/v1/profiles/${me}/recitations/accord`],
      ['GET', `/api/v1/profiles/${me}/recitations`],
      ['GET', `/api/v1/profiles/${me}/khatma`],
      ['POST', `/api/v1/profiles/${me}/choisir-niveau/arabe`],
      ['POST', '/api/v1/tutor/en1.l01/ask'],
      ['GET', '/api/v1/tutor/status'],
      ['GET', '/api/v1/tuteur-ia/etat'],
      ['GET', `/api/v1/rapport-hebdo/${me}`],
      ['POST', '/api/v1/fils/x/messages'],
      ['POST', '/api/v1/notifications/abonnement'],
      ['POST', '/api/v1/profiles/rattacher'],
    ] as const)
      expect(ok(m, u), `${m} ${u}`).toBe(false);
  });
  it('chaque route sensible : refusée', () => {
    const refus: Array<[string, string]> = [
      ['GET', '/api/v1/profiles'],
      ['POST', '/api/v1/profiles'],
      ['PATCH', `/api/v1/profiles/${me}`],
      ['DELETE', `/api/v1/profiles/${me}`],
      ['POST', `/api/v1/profiles/${me}/acces`],
      ['GET', `/api/v1/profiles/${me}/responsables`],
      ['POST', `/api/v1/profiles/${me}/emancipation`],
      ['PUT', `/api/v1/profiles/${me}/mode-evaluation`],
      ['POST', `/api/v1/profiles/${me}/ecoute/accord`],
      ['GET', `/api/v1/profiles/${me}/classes`],
      ['POST', '/api/v1/auth/password'],
      ['POST', '/api/v1/auth/logout-all'],
      ['POST', '/api/v1/auth/totp/setup'],
      ['GET', '/api/v1/account/consents'],
      ['GET', '/api/v1/account/export'],
      ['GET', '/api/v1/account/suppression'],
      ['GET', '/api/v1/billing/me'],
      ['POST', '/api/v1/billing/checkout'],
      ['GET', '/api/v1/teacher/classes'],
      ['GET', '/api/v1/admin/stats'],
      ['GET', '/api/v1/ecole/mes-ecoles'],
      ['POST', '/api/v1/famille/invitation'],
    ];
    for (const [m, u] of refus) expect(ok(m, u), `${m} ${u}`).toBe(false);
  });
  it('un autre profil, jamais : adresse, corps, requête, profondeur', () => {
    expect(ok('GET', `/api/v1/profiles/${autre}/accueil`)).toBe(false);
    expect(ok('POST', '/api/v1/attempts', { profileId: autre })).toBe(false);
    expect(ok('POST', '/api/v1/sync', { ops: [{ a: { profile_id: autre } }] })).toBe(false);
    expect(autoriseEnfant('GET', '/api/v1/today', me, undefined, { profileId: autre })).toBe(false);
    expect(ok('GET', '/api/v1/profiles/pas-un-uuid/accueil')).toBe(false);
  });
});

describe.skipIf(!URL)('comptes d’enfants avec identifiant (awform_test)', () => {
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
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    cookie = '',
    payload?: object,
  ) => app.inject({ method, url, payload, headers: { ...H, ...(cookie ? { cookie } : {}) } });
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
  const creer = (cookie: string, identifiant: string, over: object = {}) =>
    appel('POST', '/api/v1/profiles', cookie, {
      pseudonym: 'Lina',
      birthYear: YEAR - 9,
      identifiant,
      motDePasseEnfant: PW_ENFANT,
      declaration: true,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
      ...over,
    });
  const connexion = (identifiant: string, motDePasse = PW_ENFANT) =>
    appel('POST', '/api/v1/auth/login', '', { email: identifiant, password: motDePasse });

  let cookieParent = '';
  let idEnfant = '';

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'], withRegistry: false }),
      { code: 'enfant-login', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    cookieParent = await parent('parent.enfant@exemple.org');
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('disponibilité : forme, identifiant libre ou pris, trois propositions', async () => {
    const libre = (
      await appel(
        'GET',
        '/api/v1/profiles/login-disponible?login=lina-482&prenom=Lina',
        cookieParent,
      )
    ).json();
    expect(libre).toMatchObject({ forme: true, disponible: true });
    expect(libre.propositions).toHaveLength(3);
    const mauvaise = (
      await appel('GET', '/api/v1/profiles/login-disponible?login=a', cookieParent)
    ).json();
    expect(mauvaise).toMatchObject({ forme: false, disponible: false });
    expect(
      (await appel('GET', '/api/v1/profiles/login-disponible?login=lina-482')).statusCode,
    ).toBe(401);
  });

  it('création en un écran : déclaration, forme, mot de passe, unicité', async () => {
    expect((await creer(cookieParent, 'lina-482', { declaration: false })).json().error.code).toBe(
      'declaration_requise',
    );
    expect((await creer(cookieParent, 'Lina é')).json().error.code).toBe('identifiant_invalide');
    expect(
      (await creer(cookieParent, 'lina-482', { motDePasseEnfant: 'court' })).json().error.code,
    ).toMatch(/^mot_de_passe_/);
    expect(
      (await creer(cookieParent, 'lina-482', { motDePasseEnfant: 'lina-482' })).json().error.code,
    ).toMatch(/^mot_de_passe_/);
    const ok = await creer(cookieParent, 'lina-482');
    expect(ok.statusCode).toBe(201);
    idEnfant = ok.json().id;
    const autreParent = await parent('autre.parent@exemple.org');
    expect((await creer(autreParent, 'lina-482')).json().error.code).toBe(
      'identifiant_indisponible',
    );
    const pris = (
      await appel('GET', '/api/v1/profiles/login-disponible?login=lina-482', autreParent)
    ).json();
    expect(pris.disponible).toBe(false);
  });

  it('connexion par identifiant : session limitée à SON profil, rien du compte du parent', async () => {
    const r = await connexion('Lina-482'); // la casse ne compte pas
    expect(r.statusCode).toBe(200);
    const c = cookieOf(r);
    const moi = (await appel('GET', '/api/v1/auth/me', c)).json();
    expect(moi.profiles.map((p: { id: string }) => p.id)).toEqual([idEnfant]);
    expect(moi.account.email).toBeNull();
    expect(moi.enfantSession).toBe(true);
    // lecture publique et apprentissage : permis
    expect((await appel('GET', '/api/v1/levels', c)).statusCode).toBe(200);
  });

  it('session limitée : chaque route sensible refusée (session_limitee)', async () => {
    const c = cookieOf(await connexion('lina-482'));
    const autreProfil = randomUUID();
    const routes: Array<['GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', string, object?]> = [
      ['GET', '/api/v1/profiles'],
      ['POST', '/api/v1/profiles', { pseudonym: 'X', birthYear: YEAR - 8, consents: [] }],
      ['PATCH', `/api/v1/profiles/${idEnfant}`, { pseudonym: 'Pirate' }],
      ['DELETE', `/api/v1/profiles/${idEnfant}`, { password: PW }],
      ['POST', `/api/v1/profiles/${idEnfant}/acces`, { motDePasse: 'nouveau-mot-2026' }],
      ['GET', `/api/v1/profiles/${idEnfant}/responsables`],
      ['GET', `/api/v1/profiles/${autreProfil}/accueil`],
      ['POST', '/api/v1/auth/password', { current: PW, next: 'autre phrase de passe 2027' }],
      ['POST', '/api/v1/auth/logout-all'],
      ['POST', '/api/v1/auth/totp/setup', {}],
      ['GET', '/api/v1/account/consents'],
      ['GET', '/api/v1/account/export'],
      ['GET', '/api/v1/account/suppression'],
      ['GET', '/api/v1/billing/me'],
      ['GET', '/api/v1/teacher/classes'],
    ];
    for (const [m, u, p] of routes) {
      const r = await appel(m, u, c, p);
      expect(r.statusCode, `${m} ${u}`).toBe(403);
      expect(r.json().error.code, `${m} ${u}`).toBe('session_limitee');
    }
    // le mot de passe du parent n'a pas changé, le profil non plus
    const encore = await appel('POST', '/api/v1/auth/login', '', {
      email: 'parent.enfant@exemple.org',
      password: PW,
    });
    expect(encore.statusCode).toBe(200);
  });

  it('messages : identifiant inconnu et mot de passe faux se ressemblent (rien n’est révélé)', async () => {
    const faux = await connexion('lina-482', 'mauvais-mot-2026');
    const inconnu = await connexion('personne-999', 'mauvais-mot-2026');
    expect(faux.statusCode).toBe(401);
    expect(inconnu.statusCode).toBe(401);
    expect(faux.json().error.code).toBe(inconnu.json().error.code);
    expect(Object.keys(faux.json().error).sort()).toEqual(Object.keys(inconnu.json().error).sort());
  });

  it('verrou : 8 essais puis pause ; le parent débloque ; un autre parent n’a aucune prise', async () => {
    let dernier = faux();
    function faux() {
      return null as LightMyRequestResponse | null;
    }
    for (let i = 0; i < 8; i++) dernier = await connexion('lina-482', `mauvais-${i}-mot-2026`);
    expect(dernier!.statusCode).toBe(429);
    expect(dernier!.json().error.code).toBe('verrouille');
    // même le bon mot de passe est refusé pendant la pause
    expect((await connexion('lina-482')).statusCode).toBe(429);
    // un autre parent ne peut ni débloquer, ni changer le mot de passe (profil « introuvable »)
    const autre = await parent('troisieme.parent@exemple.org');
    expect(
      (await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, autre, { debloquer: true }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, autre, {
          motDePasse: 'pirate-mot-2026',
        })
      ).statusCode,
    ).toBe(404);
    expect((await connexion('lina-482')).statusCode).toBe(429);
    // le parent débloque
    expect(
      (await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, cookieParent, { debloquer: true }))
        .statusCode,
    ).toBe(200);
    expect((await connexion('lina-482')).statusCode).toBe(200);
  });

  it('profil d’enfant EXISTANT sans identifiant : le parent lui en crée un (mêmes règles) ; un autre parent n’a aucune prise', async () => {
    const ancien = await appel('POST', '/api/v1/profiles', cookieParent, {
      pseudonym: 'Samir',
      birthYear: YEAR - 11,
      password: PW,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    });
    expect(ancien.statusCode).toBe(201);
    const sid = ancien.json().id as string;
    expect((await appel('GET', `/api/v1/profiles/${sid}/acces`, cookieParent)).json()).toEqual({
      identifiant: null,
    });
    const autre = await parent('quatrieme.parent@exemple.org');
    const demande = { identifiant: 'samir-217', motDePasse: PW_ENFANT, declaration: true };
    expect((await appel('POST', `/api/v1/profiles/${sid}/acces`, autre, demande)).statusCode).toBe(
      404,
    );
    expect((await appel('GET', `/api/v1/profiles/${sid}/acces`, autre)).statusCode).toBe(404);
    expect(
      (
        await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, {
          ...demande,
          declaration: false,
        })
      ).json().error.code,
    ).toBe('declaration_requise');
    expect(
      (
        await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, {
          ...demande,
          identifiant: 'Samir é',
        })
      ).json().error.code,
    ).toBe('identifiant_invalide');
    expect(
      (
        await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, {
          ...demande,
          motDePasse: 'court',
        })
      ).json().error.code,
    ).toMatch(/^mot_de_passe_/);
    expect(
      (
        await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, {
          ...demande,
          identifiant: 'lina-482',
        })
      ).statusCode,
    ).toBe(409);
    const ok = await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, demande);
    expect(ok.statusCode).toBe(201);
    expect((await appel('GET', `/api/v1/profiles/${sid}/acces`, cookieParent)).json()).toEqual({
      identifiant: 'samir-217',
    });
    // l'identifiant ne se change pas par ce chemin
    expect(
      (await appel('POST', `/api/v1/profiles/${sid}/acces`, cookieParent, demande)).json().error
        .code,
    ).toBe('identifiant_existant');
    const c = cookieOf(await connexion('samir-217'));
    expect(
      (await appel('GET', '/api/v1/auth/me', c)).json().profiles.map((p: { id: string }) => p.id),
    ).toEqual([sid]);
    // frère ou sœur : jamais (même parent, autre profil)
    expect((await appel('GET', `/api/v1/today/${idEnfant}`, c)).json().error.code).toBe(
      'session_limitee',
    );
    expect((await appel('GET', `/api/v1/dashboard/${idEnfant}`, c)).json().error.code).toBe(
      'session_limitee',
    );
    expect((await appel('GET', `/api/v1/profiles/${idEnfant}/accueil`, c)).json().error.code).toBe(
      'session_limitee',
    );
    expect((await appel('GET', `/api/v1/today/${sid}`, c)).statusCode).not.toBe(403);
  });

  it('ado en session limitée : tuteur IA seulement avec l’accord parental ; enfant jamais ; signalement sans texte libre ; récitateur sur son profil', async () => {
    const mk = async (nom: string, age: number, id: string) => {
      const r = await appel('POST', '/api/v1/profiles', cookieParent, {
        pseudonym: nom,
        birthYear: YEAR - age,
        identifiant: id,
        motDePasseEnfant: PW_ENFANT,
        declaration: true,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      });
      expect(r.statusCode).toBe(201);
      return r.json().id as string;
    };
    const idAdo = await mk('Nour', 15, 'nour-381');
    const idPetit = await mk('Omar', 8, 'omar-562');
    const cAdo = cookieOf(await connexion('nour-381'));
    const cPetit = cookieOf(await connexion('omar-562'));
    expect((await appel('GET', '/api/v1/auth/me', cAdo)).json()).toMatchObject({
      enfantAdo: true,
      enfantTuteurIa: false,
    });
    expect((await appel('GET', '/api/v1/auth/me', cPetit)).json()).toMatchObject({
      enfantAdo: false,
    });
    const libre = (c: string, id: string) =>
      appel('POST', `/api/v1/tuteur-ia/${id}/libre`, c, { unitId: 'en1.l01', texte: 'bonjour' });
    expect((await libre(cAdo, idAdo)).json().error.code).toBe('session_limitee'); // sans accord
    const [compte] = await h.db
      .select({ a: t.profile.ownerAccountId })
      .from(t.profile)
      .where(eq(t.profile.id, idAdo));
    await h.db
      .insert(t.consent)
      .values({ accountId: compte!.a, profileId: idAdo, type: 'tuteur_ia', textVersion: 'test' });
    await h.db
      .insert(t.consent)
      .values({ accountId: compte!.a, profileId: idPetit, type: 'tuteur_ia', textVersion: 'test' });
    expect((await appel('GET', '/api/v1/auth/me', cAdo)).json()).toMatchObject({
      enfantTuteurIa: true,
    });
    expect((await libre(cAdo, idAdo)).json().error?.code).not.toBe('session_limitee'); // avec accord : la route elle-même décide
    expect((await libre(cPetit, idPetit)).json().error.code).toBe('session_limitee'); // enfant : jamais, même avec l'accord
    expect((await libre(cAdo, idPetit)).json().error.code).toBe('session_limitee'); // jamais le profil d'un autre
    // signalement : motif prédéfini seulement
    const sig = (c: string, extra: object) =>
      appel('POST', '/api/v1/contenu/signalements', c, {
        targetKind: 'lecon',
        unitId: 'en1.l01',
        path: 'x',
        reason: 'audio_faux',
        ...extra,
      });
    expect((await sig(cAdo, { comment: 'bla' })).json().error.code).toBe('session_limitee');
    expect((await sig(cPetit, { excerpt: 'bla' })).json().error.code).toBe('session_limitee');
    expect((await sig(cPetit, { reason: 'sens' })).json().error.code).toBe('session_limitee');
    const bon = await sig(cPetit, {});
    expect(bon.json().error?.code).not.toBe('session_limitee');
    expect([200, 201, 404]).toContain(bon.statusCode);
    // récitateur : le sien oui, celui d'un autre non
    const rec = (c: string, id: string) =>
      appel('PUT', `/api/v1/profiles/${id}/quran/reciter`, c, { reciterId: null });
    expect((await rec(cPetit, idPetit)).statusCode).toBe(200);
    expect((await rec(cPetit, idAdo)).json().error.code).toBe('session_limitee');
  });

  it('nouveau mot de passe donné par le parent : l’ancien et les anciennes sessions ne marchent plus', async () => {
    const ancienne = cookieOf(await connexion('lina-482'));
    expect(
      (
        await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, cookieParent, {
          motDePasse: 'abc',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, cookieParent, {})).statusCode,
    ).toBe(400);
    expect(
      (
        await appel('POST', `/api/v1/profiles/${idEnfant}/acces`, cookieParent, {
          motDePasse: 'nuage-bleu-77',
        })
      ).statusCode,
    ).toBe(200);
    expect((await appel('GET', '/api/v1/auth/me', ancienne)).statusCode).toBe(401);
    expect((await connexion('lina-482', PW_ENFANT)).statusCode).toBe(401);
    expect((await connexion('lina-482', 'nuage-bleu-77')).statusCode).toBe(200);
  });
});
