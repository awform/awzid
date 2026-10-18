/**
 * Identités (18/10/2026) — numéro WhatsApp et « Continuer avec Google » :
 *  - sans base : jeton d'identité OpenID (signature, iss, aud, exp, nonce, email_verified), PKCE, cookies chiffrés,
 *    signature du webhook de Meta, configuration (simulation et faux fournisseur refusés en production) ;
 *  - avec la base de test : parcours par numéro complet en mode SIMULÉ (vérification inversée, inscription, codes de
 *    récupération, connexion par numéro), limites (60 s, par numéro, plafond quotidien, essais), revérification après
 *    une longue absence, unicité, validation manuelle, nouveau mot de passe (numéro, code de récupération), liste
 *    d'attente et invitations par numéro, inscription assistée, export RGPD et effacement ; Google (state, nonce, PKCE,
 *    nouvelle inscription avec invitation exigée, pas de liaison silencieuse, liaison depuis le compte, personnel exclu).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { eq } from 'drizzle-orm';
import { invalidateAcces, schema as t } from '@awform/db';
import { emettreJeton } from '../src/antibot.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import {
  googleFromEnv,
  telephoneFromEnv,
  type ConfigGoogle,
  type ConfigTelephone,
} from '../src/identites/config.js';
import { expediteurMemoire } from '../src/identites/expediteur.js';
import {
  ErreurJeton,
  Jwks,
  ouvrir,
  pkce,
  sceller,
  verifierJetonIdentite,
} from '../src/identites/oidc.js';
import { messagesDuWebhook, signatureMetaValide } from '../src/identites/routes-telephone.js';
import { cookieOf, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL_DB = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;
const CLIENT = 'client-essai.apps.googleusercontent.com';
const ISS = 'https://oidc.essai.local';

// ------------------------------------------------------------------ faux fournisseur OpenID (clés de test)

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...(publicKey.export({ format: 'jwk' }) as object),
  kid: 'k1',
  alg: 'RS256',
  use: 'sig',
};
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(
  claims: Record<string, unknown>,
  head: object = { alg: 'RS256', kid: 'k1' },
  key: KeyObject = privateKey,
) {
  const data = `${b64(head)}.${b64(claims)}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}
const maintenant = () => Math.floor(Date.now() / 1000);
const claimsOk = (nonce: string, extra: object = {}) => ({
  iss: ISS,
  aud: CLIENT,
  sub: 'g-1',
  email: 'Famille.Google@exemple.org',
  email_verified: true,
  name: 'Famille Google',
  nonce,
  iat: maintenant(),
  exp: maintenant() + 600,
  ...extra,
});
const fetchJwks = (async () =>
  new Response(JSON.stringify({ keys: [jwk] }), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })) as unknown as typeof fetch;

describe('OpenID Connect : vérification du jeton d’identité (sans base)', () => {
  const jwks = new Jwks('https://x/certs', fetchJwks);
  const v = (tok: string, nonce = 'n1') =>
    verifierJetonIdentite(tok, { jwks, clientId: CLIENT, issuers: [ISS], nonce });
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return e instanceof ErreurJeton ? e.code : String(e);
    }
  };

  it('jeton valable : identifiant, adresse en minuscules, nom', async () => {
    expect(await v(jwt(claimsOk('n1')))).toEqual({
      sub: 'g-1',
      email: 'famille.google@exemple.org',
      name: 'Famille Google',
    });
  });

  it('refus : signature, algorithme, clé inconnue, émetteur, audience, expiration, nonce, adresse non vérifiée', async () => {
    const autre = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(await code(v(jwt(claimsOk('n1'), undefined, autre)))).toBe('jeton_signature');
    expect(await code(v(jwt(claimsOk('n1'), { alg: 'none', kid: 'k1' })))).toBe('jeton_algorithme');
    expect(await code(v(jwt(claimsOk('n1'), { alg: 'RS256', kid: 'inconnue' })))).toBe('jeton_cle');
    expect(await code(v(jwt(claimsOk('n1', { iss: 'https://pirate' }))))).toBe('jeton_emetteur');
    expect(await code(v(jwt(claimsOk('n1', { aud: 'autre-client' }))))).toBe('jeton_audience');
    expect(await code(v(jwt(claimsOk('n1', { exp: maintenant() - 120 }))))).toBe('jeton_expire');
    expect(await code(v(jwt(claimsOk('autre'))))).toBe('jeton_nonce');
    expect(await code(v(jwt(claimsOk('n1', { email_verified: false }))))).toBe('email_non_verifie');
    expect(await code(v('pas.un-jeton'))).toBe('jeton_format');
  });

  it('PKCE S256, cookies chiffrés datés (illisibles par un autre serveur, expirés refusés)', () => {
    const p = pkce();
    expect(p.challenge).toBe(createHash('sha256').update(p.verifier).digest('base64url'));
    expect(p.verifier.length).toBeGreaterThanOrEqual(43);
    const k = randomBytes(32);
    const box = sceller(k, { a: 1 }, 1000);
    expect(ouvrir<{ a: number }>(k, box)?.a).toBe(1);
    expect(ouvrir(randomBytes(32), box)).toBeNull();
    expect(ouvrir(k, box, Date.now() + 2000)).toBeNull();
  });
});

describe('WhatsApp : webhook et configuration (sans base)', () => {
  it('signature X-Hub-Signature-256 et lecture des messages texte', () => {
    const corps = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '221771234567', type: 'text', text: { body: 'AWZID 4F7K2Q' } },
                  { from: '221771234567', type: 'image' },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = `sha256=${createHash('sha256').update('x').digest('hex')}`;
    expect(signatureMetaValide('secret', corps, sig)).toBe(false);
    const bonne = `sha256=${createHmac('sha256', 'secret').update(corps).digest('hex')}`;
    expect(signatureMetaValide('secret', corps, bonne)).toBe(true);
    expect(signatureMetaValide('autre', corps, bonne)).toBe(false);
    expect(messagesDuWebhook(JSON.parse(corps))).toEqual([
      { de: '221771234567', texte: 'AWZID 4F7K2Q' },
    ]);
  });

  it('interrupteurs éteints par défaut ; simulation et faux fournisseur refusés en production', () => {
    const k = randomBytes(32);
    expect(telephoneFromEnv({}, k).actif).toBe(false);
    const env = {
      AWFORM_TELEPHONE: 'on',
      AWFORM_WHATSAPP: 'simule',
      AWFORM_WHATSAPP_NUMERO: '+221700000000',
    };
    expect(telephoneFromEnv(env, k)).toMatchObject({ actif: true, envoi: false, manuel: false });
    expect(telephoneFromEnv(env, null).actif).toBe(false);
    expect(telephoneFromEnv({ ...env, NODE_ENV: 'production' }, k).actif).toBe(false);
    // validation manuelle : possible sans Meta, 48 h
    expect(
      telephoneFromEnv(
        { ...env, AWFORM_WHATSAPP: '', NODE_ENV: 'production', AWFORM_TELEPHONE_MANUEL: 'on' },
        k,
      ),
    ).toMatchObject({ actif: true, manuel: true, dureeEntrantMs: 48 * 3600_000 });
    // réception par Meta sans secret : inactive
    expect(telephoneFromEnv({ ...env, AWFORM_WHATSAPP: 'cloud' }, k).actif).toBe(false);
    const g = {
      AWFORM_GOOGLE: 'on',
      AWFORM_GOOGLE_CLIENT_ID: 'a',
      AWFORM_GOOGLE_CLIENT_SECRET: 'b',
    };
    expect(googleFromEnv({}, 'https://awzid.com', k).actif).toBe(false);
    expect(googleFromEnv(g, 'https://awzid.com', k)).toMatchObject({
      actif: true,
      redirectUri: 'https://awzid.com/api/v1/auth/google/callback',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    expect(googleFromEnv(g, null, k).actif).toBe(false);
    expect(
      googleFromEnv(
        { ...g, AWFORM_GOOGLE_ESSAI_URL: 'http://127.0.0.1:9', NODE_ENV: 'production' },
        'https://a.b',
        k,
      ).essai,
    ).toBe(false);
  });
});

// ------------------------------------------------------------------ avec la base de test

describe.skipIf(!URL_DB)('Identités : numéro WhatsApp et Google (awform_test)', () => {
  let c: Ctx;
  let A: H; // administrateur (second facteur)
  const exp = expediteurMemoire();
  const cfgTel: ConfigTelephone = {
    actif: true,
    numeroAwzid: '+221700000000',
    mode: 'simule',
    appSecret: null,
    verifyToken: null,
    manuel: false,
    dureeEntrantMs: 10 * 60_000,
    envoi: true,
    cloud: null,
    journalDir: null,
    plafondJour: 50,
    parHeure: 200,
    parIp: 10,
    reverifJours: 180,
  };
  const cfgGoogle: ConfigGoogle = {
    actif: true,
    clientId: CLIENT,
    clientSecret: 'secret-essai',
    redirectUri: 'https://beta.exemple.org/api/v1/auth/google/callback',
    authUrl: `${ISS}/auth`,
    tokenUrl: `${ISS}/token`,
    jwksUrl: `${ISS}/certs`,
    issuers: [ISS],
    essai: true,
  };
  /** faux fournisseur : code → identité, nonce et défi PKCE attendus */
  const codes = new Map<string, { nonce: string; challenge: string; sub: string; email: string }>();
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/certs')) return fetchJwks(u);
    if (u.endsWith('/token')) {
      const p = new URLSearchParams(String(init?.body ?? ''));
      const e = codes.get(p.get('code') ?? '');
      const okPkce =
        e &&
        createHash('sha256')
          .update(p.get('code_verifier') ?? '')
          .digest('base64url') === e.challenge;
      if (!e || !okPkce || p.get('client_secret') !== 'secret-essai')
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      codes.delete(p.get('code')!);
      return new Response(
        JSON.stringify({
          id_token: jwt(claimsOk(e.nonce, { sub: e.sub, email: e.email })),
        }),
      );
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  const cfg = { ...cfgTel };
  const settle = () => new Promise((r) => setTimeout(r, 30));
  const vieillir = async (phoneHashLike?: string) => {
    // contourne les limites de temps (renvoi après 60 s, 4 par heure) en vieillissant les vérifications
    void phoneHashLike;
    await c.h.pool.query("update phone_challenge set created_at = created_at - interval '2 hours'");
  };
  let num = 0;
  const nouveauNumero = () => `+2217712${String(++num).padStart(5, '0')}`;

  const defi = async (numero: string, objet = 'inscription', h: H = {}, extra: object = {}) => {
    const r = await c.req('POST', '/api/v1/tel/defis', h, { numero, objet, ...extra });
    return r;
  };
  /** vérification inversée complète : la personne envoie le message pré-rempli depuis SON numéro */
  const verifier = async (numero: string, objet = 'inscription', h: H = {}) => {
    const r = await defi(numero, objet, h);
    expect(r.statusCode, r.body).toBe(201);
    const d = r.json() as { id: string; jeton: string; code: string };
    const s = await c.req(
      'POST',
      '/api/v1/tel/simulateur',
      {},
      {
        de: numero.replace('+', ''),
        texte: `Bonjour Awzid, voici mon code : AWZID ${d.code}`,
      },
    );
    expect(s.json().resultat).toBe('validee');
    return { id: d.id, jeton: d.jeton };
  };
  const inscrire = (body: object) =>
    c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        password: PW,
        country: 'SN',
        consents: ['cgu', 'donnee_religieuse_art9', 'transfert_hors_pays'],
        ...body,
      },
    );

  beforeAll(async () => {
    c = await setup(URL_DB!, [], {
      publicUrl: 'https://beta.exemple.org',
      telephone: cfg,
      expediteurTel: exp,
      google: cfgGoogle,
      googleFetch: fetchImpl,
    });
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.id@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    A = {
      cookie: cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'admin.id@exemple.org', password: PW },
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
    await c.h.pool.query('delete from site_setting');
    await c.h.pool.query('delete from auth_throttle');
    invalidateAcces();
  });

  it('statut public : les trois façons d’entrer annoncées', async () => {
    const s = (await c.req('GET', '/api/v1/acces/statut')).json();
    expect(s).toMatchObject({ google: true, telephone: true, telephoneEnvoi: true });
  });

  it('parcours complet par numéro (mode simulé) : vérification inversée, inscription, codes, connexion', async () => {
    const numero = nouveauNumero();
    const r = await defi(numero);
    const d = r.json();
    expect(d).toMatchObject({ canal: 'entrant', numeroAwzid: '+221700000000' });
    expect(d.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    const etat = () => c.req('POST', '/api/v1/tel/defis/etat', {}, { id: d.id, jeton: d.jeton });
    expect((await etat()).json().etat).toBe('en_attente');
    // un AUTRE numéro qui envoie le bon code : ignoré (la preuve est l'expéditeur)
    const pirate = await c.req(
      'POST',
      '/api/v1/tel/simulateur',
      {},
      { de: '221779999999', texte: `AWZID ${d.code}` },
    );
    expect(pirate.json().resultat).toBe('ignore');
    // le bon numéro, mauvais code : ignoré
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/tel/simulateur',
          {},
          { de: numero.slice(1), texte: 'AWZID 222222' },
        )
      ).json().resultat,
    ).toBe('ignore');
    const ok = await c.req(
      'POST',
      '/api/v1/tel/simulateur',
      {},
      { de: numero.slice(1), texte: `awzid ${d.code}` },
    );
    expect(ok.json().resultat).toBe('validee');
    expect((await etat()).json().etat).toBe('validee');
    // mauvais jeton de page : rien
    expect(
      (await c.req('POST', '/api/v1/tel/defis/etat', {}, { id: d.id, jeton: 'x'.repeat(43) }))
        .statusCode,
    ).toBe(404);
    const su = await inscrire({ defi: { id: d.id, jeton: d.jeton } });
    expect(su.statusCode, su.body).toBe(201);
    const body = su.json();
    expect(body.codesSecours).toHaveLength(8);
    expect(body.codesSecours[0]).toMatch(/^[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/);
    expect(body.account.email).toBeNull();
    expect(body.account.telephone).toMatch(/^\+221 •+ \d\d$/);
    expect(body.account.emailVerified).toBe(true);
    // numéro chiffré au repos, empreinte : jamais en clair en base
    const [row] = await c.h.db.select().from(t.account).where(eq(t.account.id, body.account.id));
    expect(row!.phoneEnc).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(numero.slice(4));
    expect((await etat()).json().etat).toBe('utilisee');
    // la vérification ne sert qu'une fois
    expect((await inscrire({ defi: { id: d.id, jeton: d.jeton } })).json().error.code).toBe(
      'verification_invalide',
    );
    // connexion par numéro, forme nationale sénégalaise
    const nat = `${numero.slice(4, 6)} ${numero.slice(6, 9)} ${numero.slice(9, 11)} ${numero.slice(11)}`;
    const lg = await c.req('POST', '/api/v1/auth/login', {}, { email: nat, password: PW });
    expect(lg.statusCode, lg.body).toBe(200);
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: numero, password: 'faux mot de passe 2026' },
        )
      ).statusCode,
    ).toBe(401);
    // unicité : le même numéro ne sert pas deux comptes (dit seulement à qui a prouvé le numéro)
    await vieillir();
    const d2 = await verifier(numero);
    const doublon = await inscrire({ defi: d2 });
    expect(doublon.statusCode).toBe(409);
    expect(doublon.json().error.code).toBe('telephone_indisponible');
  });

  it('limites : renvoi après 60 s, 4 par numéro et par heure, numéro invalide, inscription sans vérification', async () => {
    const numero = nouveauNumero();
    expect((await defi(numero)).statusCode).toBe(201);
    const trop = await defi(numero);
    expect(trop.statusCode).toBe(429);
    expect(trop.json().error).toMatchObject({ code: 'renvoi_trop_tot' });
    expect(trop.json().error.secondes).toBeGreaterThan(50);
    // trois renvois dans l'heure : le cinquième est refusé
    for (let i = 0; i < 3; i++) {
      await c.h.pool.query(
        "update phone_challenge set created_at = created_at - interval '61 seconds'",
      );
      expect((await defi(numero)).statusCode).toBe(201);
    }
    await c.h.pool.query(
      "update phone_challenge set created_at = created_at - interval '61 seconds'",
    );
    expect((await defi(numero)).json().error.code).toBe('trop_de_demandes');
    expect((await defi('+221 33 821 00 00')).json().error.code).toBe('numero_mobile');
    expect((await defi('12')).json().error.code).toBe('numero_indicatif');
    // une vérification non validée ne permet pas l'inscription (limite par adresse IP remise à zéro pour la suite)
    await c.h.pool.query('delete from auth_throttle');
    await vieillir();
    const n2 = nouveauNumero();
    const d = (await defi(n2)).json();
    expect((await inscrire({ defi: { id: d.id, jeton: d.jeton } })).json().error.code).toBe(
      'verification_invalide',
    );
    // anti-robots AVANT tout envoi (réglage allumé)
    await c.req('PUT', '/api/v1/admin/acces', A, { antibot: 'on' });
    invalidateAcces();
    await vieillir();
    expect((await defi(nouveauNumero())).json().error.code).toBe('antibot_echec');
    expect(
      (
        await defi(
          nouveauNumero(),
          'inscription',
          {},
          { jeton: emettreJeton(null, Date.now() - 4000) },
        )
      ).statusCode,
    ).not.toBe(201); // jeton signé avec une autre clé
  });

  it('secours payant (canal sortant) : jeton anti-robots exigé, 3 essais, plafond quotidien et alerte', async () => {
    await vieillir();
    const numero = nouveauNumero();
    // envoi : jeton anti-robots exigé même réglage éteint
    expect((await defi(numero, 'inscription', {}, { canal: 'sortant' })).json().error.code).toBe(
      'antibot_echec',
    );
    const jeton = (await c.req('GET', '/api/v1/acces/jeton')).json().jeton as string;
    await new Promise((r) => setTimeout(r, 3100));
    const r = await defi(numero, 'inscription', {}, { canal: 'sortant', jeton });
    expect(r.statusCode, r.body).toBe(201);
    const d = r.json();
    expect(d.code).toBeUndefined(); // le code n'est jamais dans la réponse
    const envoye = exp.sent.at(-1)!;
    expect(envoye).toMatchObject({ to: numero, kind: 'code' });
    const essai = (code: string) =>
      c.req('POST', '/api/v1/tel/defis/code', {}, { id: d.id, jeton: d.jeton, code });
    const faux = envoye.code === '000000' ? '111111' : '000000';
    expect((await essai(faux)).json().error).toMatchObject({ code: 'code_incorrect', restants: 2 });
    expect((await essai(faux)).json().error.restants).toBe(1);
    expect((await essai(faux)).json().error.restants).toBe(0);
    expect((await essai(envoye.code!)).json().error.code).toBe('code_expire');
    // plafond quotidien : atteint → refus et alerte critique au tableau de bord
    cfg.plafondJour = 1;
    await vieillir();
    const j2 = (await c.req('GET', '/api/v1/acces/jeton')).json().jeton as string;
    await new Promise((r) => setTimeout(r, 3100));
    const plein = await defi(nouveauNumero(), 'inscription', {}, { canal: 'sortant', jeton: j2 });
    expect(plein.json().error.code).toBe('envoi_plafond');
    const tab = (await c.req('GET', '/api/v1/admin/tableau', A)).json();
    expect(tab.telephone).toMatchObject({ envoisJour: 1, plafondJour: 1 });
    expect(tab.alertes.map((a: { code: string }) => a.code)).toContain('tel_plafond_atteint');
    cfg.plafondJour = 50;
  }, 20_000);

  it('revérification du numéro après une longue absence (numéros recyclés)', async () => {
    await vieillir();
    const numero = nouveauNumero();
    const su = await inscrire({ defi: await verifier(numero) });
    const id = su.json().account.id as string;
    await c.h.pool.query(
      "update account set last_login_at = now() - interval '200 days', phone_verified_at = now() - interval '200 days', created_at = now() - interval '300 days' where id = $1",
      [id],
    );
    const r = await c.req('POST', '/api/v1/auth/login', {}, { email: numero, password: PW });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('reverification_requise');
    await vieillir();
    // une vérification d'un AUTRE numéro ne vaut pas
    const autre = await verifier(nouveauNumero(), 'reverification');
    expect(
      (
        await c.req('POST', '/api/v1/auth/login', {}, { email: numero, password: PW, defi: autre })
      ).json().error.code,
    ).toBe('verification_invalide');
    await vieillir();
    const d = await verifier(numero, 'reverification');
    const ok = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: numero, password: PW, defi: d },
    );
    expect(ok.statusCode, ok.body).toBe(200);
    // connexion suivante : plus de revérification
    expect(
      (await c.req('POST', '/api/v1/auth/login', {}, { email: numero, password: PW })).statusCode,
    ).toBe(200);
  });

  it('nouveau mot de passe : par le numéro, puis par un code de récupération (usage unique)', async () => {
    await vieillir();
    const numero = nouveauNumero();
    const su = await inscrire({ defi: await verifier(numero) });
    const codesSecours = su.json().codesSecours as string[];
    await vieillir();
    const d = await verifier(numero, 'reinitialisation');
    const NV = 'une autre phrase de passe 2026';
    const r = await c.req(
      'POST',
      '/api/v1/auth/password-reset/telephone',
      {},
      { defi: d, password: NV },
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(
      (await c.req('POST', '/api/v1/auth/login', {}, { email: numero, password: NV })).statusCode,
    ).toBe(200);
    // code de récupération : sans aucun envoi ; minuscules et espaces tolérés ; un seul usage
    const NV2 = 'encore une phrase de passe 2026';
    const code = codesSecours[0]!.toLowerCase().replace('-', ' ');
    const s1 = await c.req(
      'POST',
      '/api/v1/auth/password-reset/secours',
      {},
      { identifiant: numero, code, password: NV2 },
    );
    expect(s1.statusCode, s1.body).toBe(200);
    const s2 = await c.req(
      'POST',
      '/api/v1/auth/password-reset/secours',
      {},
      { identifiant: numero, code, password: NV2 },
    );
    expect(s2.json().error.code).toBe('code_secours_invalide');
    // compte inconnu : même réponse
    const s3 = await c.req(
      'POST',
      '/api/v1/auth/password-reset/secours',
      {},
      {
        identifiant: '+221771111111',
        code: codesSecours[1],
        password: NV2,
      },
    );
    expect(s3.json().error.code).toBe('code_secours_invalide');
    const lg = await c.req('POST', '/api/v1/auth/login', {}, { email: numero, password: NV2 });
    expect(lg.statusCode).toBe(200);
    // régénération depuis le compte (mot de passe ressaisi) : 8 nouveaux, les anciens ne valent plus
    const P = { cookie: cookieOf(lg) };
    const g = await c.req('POST', '/api/v1/account/codes-secours', P, { password: NV2 });
    expect(g.json().codes).toHaveLength(8);
    expect((await c.req('GET', '/api/v1/account/telephone', P)).json()).toMatchObject({
      codesRestants: 8,
    });
    const audits = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'mot_de_passe.reinitialisation_secours'));
    expect(audits.length).toBeGreaterThan(0);
  });

  it('validation manuelle (bêta, sans Meta) : numéro masqué sauf 4 chiffres, code attendu, valider ou refuser, 48 h', async () => {
    cfg.manuel = true;
    cfg.dureeEntrantMs = 48 * 3600_000;
    await vieillir();
    const numero = nouveauNumero();
    const d = (await defi(numero)).json();
    expect(d.manuel).toBe(true);
    expect(new Date(d.expireLe).getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);
    const liste = (await c.req('GET', '/api/v1/admin/telephone/attente', A)).json();
    const ligne = liste.numeros.find((x: { code: string }) => x.code === d.code);
    expect(ligne.numero).toBe(`+221 ••••• ${numero.slice(-4)}`);
    // réservé à l'administrateur
    expect((await c.req('GET', '/api/v1/admin/telephone/attente', {})).statusCode).toBe(401);
    expect(
      (await c.req('POST', `/api/v1/admin/telephone/attente/${ligne.id}/valider`, A, {}))
        .statusCode,
    ).toBe(200);
    expect(
      (await c.req('POST', '/api/v1/tel/defis/etat', {}, { id: d.id, jeton: d.jeton })).json().etat,
    ).toBe('validee');
    const [au] = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'telephone.validation_manuelle'));
    expect(au?.target).toBe(ligne.id);
    // refus : la vérification ne vaut plus
    await vieillir();
    const n2 = nouveauNumero();
    const d2 = (await defi(n2)).json();
    const l2 = (await c.req('GET', '/api/v1/admin/telephone/attente', A))
      .json()
      .numeros.find((x: { code: string }) => x.code === d2.code);
    expect(
      (await c.req('POST', `/api/v1/admin/telephone/attente/${l2.id}/refuser`, A, {})).statusCode,
    ).toBe(200);
    expect(
      (await c.req('POST', '/api/v1/tel/defis/etat', {}, { id: d2.id, jeton: d2.jeton })).json()
        .etat,
    ).toBe('expiree');
    cfg.manuel = false;
    cfg.dureeEntrantMs = 10 * 60_000;
  });

  it('liste d’attente et invitations par numéro ; inscription assistée', async () => {
    await vieillir();
    const numero = nouveauNumero();
    const la = await c.req(
      'POST',
      '/api/v1/acces/liste-attente',
      {},
      {
        defi: await verifier(numero, 'liste_attente'),
        consentement: true,
        nom: 'Famille Diop',
      },
    );
    expect(la.statusCode).toBe(202);
    const demandes = (await c.req('GET', '/api/v1/admin/liste-attente?statut=en_attente', A)).json()
      .demandes;
    const dem = demandes.find((x: { nom: string }) => x.nom === 'Famille Diop');
    expect(dem).toMatchObject({ adresse: null });
    expect(dem.numero).toMatch(/^\+221 •+ \d\d$/);
    const acc = (
      await c.req('POST', `/api/v1/admin/liste-attente/${dem.id}/accepter`, A, {})
    ).json();
    expect(acc.lienWhatsapp).toMatch(/^https:\/\/wa\.me\/221\d{9}\?text=/);
    // invitation personnelle par numéro : un autre numéro est refusé, le bon accepté
    await c.req('PUT', '/api/v1/admin/acces', A, { mode: 'invitation' });
    invalidateAcces();
    await vieillir();
    const autre = await verifier(nouveauNumero());
    expect((await inscrire({ defi: autre, invitation: acc.code })).json().error.code).toBe(
      'invitation_autre_adresse',
    );
    await vieillir();
    const bon = await verifier(numero);
    const su = await inscrire({ defi: bon, invitation: acc.code });
    expect(su.statusCode, su.body).toBe(201);
    // inscription ASSISTÉE : l'administrateur prépare (type adulte, numéro) ; la personne choisit un mot de passe
    const nAss = nouveauNumero();
    const inv = await c.req('POST', '/api/v1/admin/invitations', A, {
      numero: nAss,
      assistee: 'adulte',
      pays: 'SN',
    });
    expect(inv.statusCode, inv.body).toBe(201);
    const ji = inv.json();
    expect(new Date(ji.expireLe).getTime() - Date.now()).toBeLessThanOrEqual(7 * 86_400_000 + 5000);
    const vue = (await c.req('POST', '/api/v1/acces/invitation', {}, { code: ji.code })).json();
    expect(vue.assistee).toMatchObject({ kind: 'adulte', pays: 'SN' });
    expect(vue.assistee.numero).toMatch(/^\+221 •+ \d\d$/);
    const sa = await inscrire({ kind: 'parent', invitation: ji.code, birthYear: YEAR - 40 });
    expect(sa.statusCode, sa.body).toBe(201);
    expect(sa.json().account.kind).toBe('adulte'); // le type préparé l'emporte
    expect(sa.json().codesSecours).toHaveLength(8);
    expect(
      (await c.req('POST', '/api/v1/auth/login', {}, { email: nAss, password: PW })).statusCode,
    ).toBe(200);
    expect(
      (await inscrire({ invitation: ji.code, email: 'x@exemple.org' })).json().error.code,
    ).toBe('invitation_epuisee');
  });

  it('export RGPD (numéro, liaison Google) et effacement du numéro avec le compte', async () => {
    await vieillir();
    const numero = nouveauNumero();
    const su = await inscrire({ defi: await verifier(numero) });
    const P = { cookie: cookieOf(su) };
    const ex = (await c.req('GET', '/api/v1/account/export', P)).json();
    expect(ex.compte.telephone).toBe(numero);
    expect(JSON.stringify(ex.donnees)).not.toMatch(/phoneEnc|phoneHash|codeHash/);
    expect(ex.donnees.recovery_code).toHaveLength(8);
    expect((await c.req('POST', '/api/v1/account/delete', P, { password: PW })).statusCode).toBe(
      200,
    );
    const [row] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.id, su.json().account.id));
    expect(row).toMatchObject({ phoneEnc: null, phoneHash: null });
    expect(
      await c.h.db.select().from(t.recoveryCode).where(eq(t.recoveryCode.accountId, row!.id)),
    ).toHaveLength(0);
    // le numéro est libre : nouvelle inscription possible
    await vieillir();
    expect((await inscrire({ defi: await verifier(numero) })).statusCode).toBe(201);
  });

  // ---------------------------------------------------------------- Google
  const google = async (
    intent = 'connexion',
    h: H = {},
    ident = { sub: 'g-new', email: 'nouvelle@exemple.org' },
  ) => {
    const st = await c.req('GET', `/api/v1/auth/google/start?intent=${intent}`, h);
    expect(st.statusCode).toBe(302);
    const loc = new URL(String(st.headers.location));
    expect(loc.origin + loc.pathname).toBe(`${ISS}/auth`);
    const q = loc.searchParams;
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('redirect_uri')).toBe(cfgGoogle.redirectUri);
    const code = randomBytes(12).toString('hex');
    codes.set(code, { nonce: q.get('nonce')!, challenge: q.get('code_challenge')!, ...ident });
    const oidc = cookieOf(st);
    const cb = await c.req(
      'GET',
      `/api/v1/auth/google/callback?code=${code}&state=${q.get('state')}`,
      { cookie: [oidc, h.cookie].filter(Boolean).join('; ') },
    );
    return { cb, state: q.get('state')!, oidc };
  };
  const cookiesOf = (r: { headers: Record<string, unknown> }) =>
    [r.headers['set-cookie']]
      .flat()
      .map((x) => String(x).split(';')[0] ?? '')
      .filter((x) => !x.endsWith('='));

  it('Google : state contrôlé, nouvelle inscription avec invitation exigée, puis connexion', async () => {
    // state falsifié : refus
    const st = await c.req('GET', '/api/v1/auth/google/start');
    const bad = await c.req('GET', '/api/v1/auth/google/callback?code=x&state=faux', {
      cookie: cookieOf(st),
    });
    expect(bad.headers.location).toBe('/connexion?google=erreur');
    // sans le cookie de la connexion : refus
    expect(
      (await c.req('GET', '/api/v1/auth/google/callback?code=x&state=y')).headers.location,
    ).toBe('/connexion?google=expire');
    const { cb } = await google('inscription');
    expect(cb.headers.location).toBe('/inscription?google=1');
    const ins = cookiesOf(cb).find((x) => x.startsWith('awzid_google_ins='))!;
    expect((await c.req('GET', '/api/v1/auth/google/inscription', { cookie: ins })).json()).toEqual(
      {
        email: 'nouvelle@exemple.org',
        nom: 'Famille Google',
      },
    );
    // accès « sur invitation » : le code reste exigé ; un enfant ou un ado ne passe pas par Google
    await c.req('PUT', '/api/v1/admin/acces', A, { mode: 'invitation' });
    invalidateAcces();
    const body = {
      kind: 'adulte',
      google: true,
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
    };
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/auth/signup',
          { cookie: ins },
          { ...body, birthYear: YEAR - 30 },
        )
      ).json().error.code,
    ).toBe('invitation_requise');
    const inv = (
      await c.req('POST', '/api/v1/admin/invitations', A, { groupe: 'beta_fermee' })
    ).json();
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/auth/signup',
          { cookie: ins },
          { ...body, birthYear: YEAR - 16, invitation: inv.code },
        )
      ).json().error.code,
    ).toBe('google_majeur_requis');
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      { cookie: ins },
      { ...body, birthYear: YEAR - 30, invitation: inv.code },
    );
    expect(su.statusCode, su.body).toBe(201);
    expect(su.json().account).toMatchObject({
      emailVerified: true,
      google: true,
      motDePasse: false,
    });
    expect(su.json().roles).toContain('beta_fermee');
    // l'identité en attente ne resservira pas
    expect(
      (
        await c.req(
          'POST',
          '/api/v1/auth/signup',
          {},
          { ...body, birthYear: YEAR - 30, invitation: inv.code },
        )
      ).json().error.code,
    ).toBe('google_expire');
    // connexion suivante par Google : session ouverte, journal « connexion.google »
    const again = await google();
    expect(again.cb.headers.location).toBe('/connexion?google=ok');
    const sess = cookiesOf(again.cb).find((x) => x.startsWith('awform_session='))!;
    expect((await c.req('GET', '/api/v1/auth/me', { cookie: sess })).json().account.email).toBe(
      'no…@exemple.org',
    );
    expect(
      await c.h.db.select().from(t.auditLog).where(eq(t.auditLog.action, 'connexion.google')),
    ).not.toHaveLength(0);
    // le même code d'autorisation ne sert qu'une fois (rejeu refusé par le fournisseur)
  });

  it('Google : pas de liaison silencieuse ; liaison après connexion ; personnel exclu ; export', async () => {
    const email = 'deja@exemple.org';
    const su = await c.req(
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
      },
    );
    const P = { cookie: cookieOf(su) };
    const ident = { sub: 'g-deja', email };
    expect((await google('connexion', {}, ident)).cb.headers.location).toBe(
      '/connexion?google=compte_existant',
    );
    expect(
      await c.h.db.select().from(t.accountIdentity).where(eq(t.accountIdentity.subject, 'g-deja')),
    ).toHaveLength(0);
    // connecté avec son mot de passe : liaison depuis le compte
    const lie = await google('liaison', P, ident);
    expect(lie.cb.headers.location).toBe('/compte?r=securite&google=lie');
    expect(
      await c.h.db.select().from(t.auditLog).where(eq(t.auditLog.action, 'liaison.google')),
    ).not.toHaveLength(0);
    const ex = (await c.req('GET', '/api/v1/account/export', P)).json();
    expect(ex.compte.google).toMatchObject({ email });
    expect(ex.donnees.account_identity).toHaveLength(1);
    // retrait (mot de passe ressaisi), puis effacement avec le compte
    expect(
      (await c.req('POST', '/api/v1/account/google/retirer', P, { password: PW })).statusCode,
    ).toBe(200);
    // personnel (administrateur) : jamais par Google
    const [adm] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'admin.id@exemple.org'));
    await c.h.db.insert(t.accountIdentity).values({
      accountId: adm!.id,
      provider: 'google',
      subject: 'g-admin',
      email: 'admin.id@exemple.org',
    });
    expect(
      (await google('connexion', {}, { sub: 'g-admin', email: 'admin.id@exemple.org' })).cb.headers
        .location,
    ).toBe('/connexion?google=personnel');
    await settle();
  });
});
