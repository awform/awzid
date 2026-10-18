/**
 * « Continuer avec Google » (18/10/2026) — OpenID Connect, flux « code » CÔTÉ SERVEUR (aucun script de Google dans
 * la page : un simple lien vers notre API, qui redirige vers accounts.google.com), PKCE S256, `state`, `nonce` ;
 * portées « openid email profile » seulement. Google nous transmet : identifiant stable (`sub`), adresse e-mail
 * vérifiée, nom affiché — rien d'autre n'est demandé ni gardé (le nom n'est gardé que sur la liaison, export RGPD).
 *
 * Règles :
 *  - identité déjà liée → connexion (sauf personnel : e-mail + second facteur seulement ; site fermé : administrateur) ;
 *  - adresse vérifiée qui correspond à un compte existant NON lié → AUCUNE liaison silencieuse : la personne se
 *    connecte d'abord avec son mot de passe, puis lie Google depuis son compte (`intent=liaison`) ;
 *  - inconnue → inscription avec les mêmes étapes (type parent ou adulte, pays, accords, code d'invitation quand
 *    l'accès est « sur invitation ») ; l'identité vérifiée attend dans un cookie chiffré de 30 minutes ; adresse tenue
 *    pour vérifiée ; mot de passe facultatif ; jamais pour un enfant (titulaire majeur exigé).
 * Journal d'audit : connexion.google, liaison.google, deliaison.google (et compte.creation avec « google »).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { accountRoles, readAcces, schema as t, type Db } from '@awform/db';
import { requiresMfa } from '../auth/policy.js';
import {
  audit,
  clearFailures,
  lockedUntil,
  readCookie,
  recordFailure,
  STAFF_ROLES,
} from '../auth/service.js';
import { err, type AuthKit } from '../auth/common.js';
import type { ConfigGoogle } from './config.js';
import {
  aleatoire,
  egal,
  ErreurJeton,
  Jwks,
  ouvrir,
  pkce,
  sceller,
  verifierJetonIdentite,
  type Fetch,
  type Revendications,
} from './oidc.js';

export const COOKIE_OIDC = 'awzid_oidc';
export const COOKIE_INSCRIPTION = 'awzid_google_ins';
const OIDC_TTL = 10 * 60_000;
const INSCRIPTION_TTL = 30 * 60_000;
const STAFF = new Set<string>(STAFF_ROLES);

type Intention = 'connexion' | 'inscription' | 'liaison';
interface Etat {
  state: string;
  nonce: string;
  verifier: string;
  intent: Intention;
  accountId?: string;
}

function cookie(name: string, value: string, path: string, maxAgeMs: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/** Identité Google vérifiée qui attend la fin de l'inscription (cookie chiffré), ou null. */
export function inscriptionGoogle(
  key: Buffer | null,
  req: FastifyRequest,
): (Revendications & { exp: number }) | null {
  if (!key) return null;
  const v = readCookie(req.headers.cookie, COOKIE_INSCRIPTION);
  return ouvrir<Revendications & { exp: number }>(key, v);
}
export const finInscriptionGoogle = (secure: boolean) =>
  cookie(COOKIE_INSCRIPTION, '', '/api/v1/auth', 0, secure);

/** Liaison Google enregistrée (à l'inscription ou depuis le compte). */
export async function lierGoogle(db: Db, accountId: string, g: Revendications): Promise<void> {
  await db.insert(t.accountIdentity).values({
    accountId,
    provider: 'google',
    subject: g.sub,
    email: g.email,
    name: g.name,
    lastUsedAt: new Date(),
  });
}

export function registerGoogle(
  app: FastifyInstance,
  kit: AuthKit,
  o: { cfg: ConfigGoogle; key: Buffer | null; fetchImpl?: Fetch },
): void {
  const { db } = kit;
  const { cfg } = o;
  const fetchImpl = o.fetchImpl ?? fetch;
  const jwks = new Jwks(cfg.jwksUrl, fetchImpl);
  const actif = () => cfg.actif && !!o.key;
  const page = (intent: Intention | undefined, code: string) =>
    intent === 'liaison'
      ? `/compte?r=securite&google=${code}`
      : intent === 'inscription' && code !== 'ok'
        ? `/inscription?google=${code}`
        : `/connexion?google=${code}`;

  /** personnel (e-mail + second facteur seulement) */
  const estPersonnel = async (a: { id: string; kind: string }) =>
    requiresMfa(a.kind) || (await accountRoles(db, a.id, a.kind)).some((r) => STAFF.has(r));

  app.get<{ Querystring: { intent?: string } }>(
    '/api/v1/auth/google/start',
    async (req, reply: FastifyReply) => {
      if (!actif()) return err(reply, 404, 'google_inactif');
      const intent: Intention =
        req.query.intent === 'liaison'
          ? 'liaison'
          : req.query.intent === 'inscription'
            ? 'inscription'
            : 'connexion';
      let accountId: string | undefined;
      if (intent === 'liaison') {
        const a = req.auth;
        if (!a || a.tablet || (a.kind !== 'parent' && a.kind !== 'adulte'))
          return reply.redirect(page('liaison', 'interdit'));
        if (a.roles.some((r) => STAFF.has(r))) return reply.redirect(page('liaison', 'personnel'));
        accountId = a.accountId;
      }
      const { verifier, challenge } = pkce();
      const etat: Etat = { state: aleatoire(), nonce: aleatoire(), verifier, intent, accountId };
      reply.header(
        'Set-Cookie',
        cookie(
          COOKIE_OIDC,
          sceller(o.key!, etat, OIDC_TTL),
          '/api/v1/auth/google',
          OIDC_TTL,
          kit.secureFor(req),
        ),
      );
      const u = new URL(cfg.authUrl);
      u.search = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: etat.state,
        nonce: etat.nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return reply.redirect(u.toString());
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/v1/auth/google/callback',
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'google_inactif');
      const secure = kit.secureFor(req);
      const c = ouvrir<Etat>(o.key!, readCookie(req.headers.cookie, COOKIE_OIDC));
      // le cookie de la connexion ne sert qu'une fois
      reply.header('Set-Cookie', cookie(COOKIE_OIDC, '', '/api/v1/auth/google', 0, secure));
      const ipKey = `google-ip:${req.ip}`;
      if (await lockedUntil(db, ipKey)) return reply.redirect(page(c?.intent, 'trop_de_demandes'));
      const echec = async (code: string) => {
        await recordFailure(db, ipKey, 20);
        return reply.redirect(page(c?.intent, code));
      };
      if (!c) return echec('expire');
      if (req.query.error) return reply.redirect(page(c.intent, 'annule'));
      if (!req.query.state || !egal(req.query.state, c.state)) return echec('erreur');
      if (!req.query.code || req.query.code.length > 2048) return echec('erreur');
      let g: Revendications;
      try {
        const r = await fetchImpl(cfg.tokenUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: req.query.code,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: cfg.redirectUri,
            grant_type: 'authorization_code',
            code_verifier: c.verifier,
          }).toString(),
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await r.json().catch(() => ({}))) as { id_token?: string };
        if (!r.ok || !body.id_token) return echec('erreur');
        g = await verifierJetonIdentite(body.id_token, {
          jwks,
          clientId: cfg.clientId,
          issuers: cfg.issuers,
          nonce: c.nonce,
        });
      } catch (e) {
        app.log.warn(
          { type: e instanceof ErreurJeton ? e.code : 'reseau' },
          'connexion Google refusée',
        );
        return echec(
          e instanceof ErreurJeton && e.code === 'email_non_verifie'
            ? 'email_non_verifie'
            : 'erreur',
        );
      }
      await clearFailures(db, ipKey);
      const [lien] = await db
        .select()
        .from(t.accountIdentity)
        .where(and(eq(t.accountIdentity.provider, 'google'), eq(t.accountIdentity.subject, g.sub)));

      // ---------------------------------------------------------------- liaison depuis le compte connecté
      if (c.intent === 'liaison') {
        if (!req.auth || req.auth.accountId !== c.accountId)
          return reply.redirect(page('liaison', 'expire'));
        if (lien)
          return reply.redirect(
            page('liaison', lien.accountId === c.accountId ? 'lie' : 'deja_lie'),
          );
        const [deja] = await db
          .select({ id: t.accountIdentity.id })
          .from(t.accountIdentity)
          .where(
            and(
              eq(t.accountIdentity.accountId, c.accountId),
              eq(t.accountIdentity.provider, 'google'),
            ),
          );
        if (deja) return reply.redirect(page('liaison', 'deja_lie'));
        await lierGoogle(db, c.accountId, g);
        await audit(db, c.accountId, 'liaison.google', c.accountId);
        return reply.redirect(page('liaison', 'lie'));
      }

      // ---------------------------------------------------------------- connexion d'un compte déjà lié
      if (lien) {
        const [a] = await db
          .select()
          .from(t.account)
          .where(and(eq(t.account.id, lien.accountId), isNull(t.account.deletedAt)));
        if (!a) return reply.redirect(page(c.intent, 'erreur'));
        if (await estPersonnel(a)) return reply.redirect(page(c.intent, 'personnel'));
        if ((await readAcces(db)).site === 'ferme') return reply.redirect(page(c.intent, 'ferme'));
        await db
          .update(t.accountIdentity)
          .set({ lastUsedAt: new Date(), email: g.email })
          .where(eq(t.accountIdentity.id, lien.id));
        await db.update(t.account).set({ lastLoginAt: new Date() }).where(eq(t.account.id, a.id));
        await audit(db, a.id, 'connexion.google', a.id);
        await kit.setSession(reply, a.id, a.kind, false);
        return reply.redirect(page('connexion', 'ok'));
      }

      // ---------------------------------------------------------------- adresse d'un compte existant : pas de liaison silencieuse
      const [existant] = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(eq(t.account.email, g.email));
      if (existant) return reply.redirect(page('connexion', 'compte_existant'));

      // ---------------------------------------------------------------- nouvelle inscription : mêmes étapes que l'inscription
      reply.header(
        'Set-Cookie',
        cookie(
          COOKIE_INSCRIPTION,
          sceller(o.key!, g, INSCRIPTION_TTL),
          '/api/v1/auth',
          INSCRIPTION_TTL,
          secure,
        ),
      );
      return reply.redirect('/inscription?google=1');
    },
  );

  /** Identité Google en attente d'inscription (affichée à l'étape 1 : adresse, nom) ; 404 sinon. */
  app.get('/api/v1/auth/google/inscription', async (req, reply) => {
    const g = inscriptionGoogle(o.key, req);
    if (!actif() || !g) return err(reply, 404, 'aucune');
    return { email: g.email, nom: g.name };
  });
  app.delete('/api/v1/auth/google/inscription', async (req, reply) => {
    reply.header('Set-Cookie', finInscriptionGoogle(kit.secureFor(req)));
    return { ok: true };
  });

  /** Retrait de la liaison (mot de passe ressaisi : un compte sans mot de passe ne peut pas perdre son seul accès). */
  app.post<{ Body: { password: string } }>(
    '/api/v1/account/google/retirer',
    {
      preHandler: kit.needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'non_connecte');
      if (!a.passwordHash) return err(reply, 409, 'mot_de_passe_requis');
      if (!(await kit.passwordOk(reply, a, req.body.password))) return reply;
      const r = await db
        .delete(t.accountIdentity)
        .where(and(eq(t.accountIdentity.accountId, a.id), eq(t.accountIdentity.provider, 'google')))
        .returning({ id: t.accountIdentity.id });
      if (!r.length) return err(reply, 404, 'introuvable');
      await audit(db, a.id, 'deliaison.google', a.id);
      return { ok: true };
    },
  );
}
