/**
 * Comptes, profils et consentements (lot 4) — CDC §4.6, ARCHITECTURE_V2 §6.4, OWASP ASVS 5.0 niveau 2.
 *  - comptes : parent (profils d'enfants SANS e-mail), adulte, enseignant, administrateur ;
 *  - consentement parental daté, versionné, avec la preuve de vérification (COPPA : ré-authentification
 *    du parent + déclaration ; moyen renforcé à ajouter avant l'ouverture aux États-Unis [À VÉRIFIER]) ;
 *  - loi sénégalaise 2008-12 et hors UE : consentement exprès au transfert des données vers l'UE ;
 *  - droits RGPD : export complet, suppression (effacement définitif sous 30 jours), retrait des
 *    consentements facultatifs ;
 *  - second facteur TOTP obligatoire pour les enseignants et les administrateurs.
 * Messages d'erreur : codes stables (traduits par l'interface), jamais d'indication sur l'existence d'un compte
 * à la connexion.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { decrypt, encrypt, hashSecret, newTotpSecret, verifySecret, verifyTotp } from './crypto.js';
import { checkPassword, MAX_LENGTH } from './passwords.js';
import {
  ageFromYear,
  consentAge,
  countryRules,
  isCountry,
  requiredAccountConsents,
  requiresMfa,
  TEXT_VERSION,
  type ConsentType,
} from './policy.js';
import {
  audit,
  clearCookie,
  clearFailures,
  COOKIE,
  failAttempt,
  reserveAttempt,
  createSession,
  lockedUntil,
  lookupSession,
  readCookie,
  recordFailure,
  revokeAll,
  revokeSession,
  sessionCookie,
  type AuthCtx,
} from './service.js';

import {
  COUNTRY,
  EMAIL,
  emailKey,
  err,
  OPTIONAL_CONSENTS,
  SIGNUPS_PER_HOUR,
  YEAR,
  type AuthKit,
} from './common.js';
import { registerPrivacy } from './donnees.js';
import { registerProfiles } from './profils.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthCtx | null;
  }
}

export interface AuthOptions {
  db: Db;
  /** cookie « Secure » (vrai en production ; les navigateurs l'acceptent aussi sur localhost) */
  /** « auto » : Secure quand la requête arrive en HTTPS (derrière Caddy) — démonstration sur le réseau local */
  cookieSecure: boolean | 'auto';
  /** clé de chiffrement des secrets TOTP (32 octets) ; absente → 2FA indisponible (signalé) */
  secretKey: Buffer | null;
}

export function registerAuth(app: FastifyInstance, opts: AuthOptions): void {
  const { db } = opts;
  const secureFor = (req: FastifyRequest) =>
    opts.cookieSecure === 'auto' ? req.protocol === 'https' : opts.cookieSecure;
  app.decorateRequest('auth', null);

  // session lue sur chaque requête API
  app.addHook('onRequest', async (req) => {
    req.auth = await lookupSession(db, readCookie(req.headers.cookie));
  });

  // audit SEC-4 : UN seul contrôle pour toutes les routes — un compte qui exige le second facteur
  // (enseignant, administrateur) sans l'avoir vérifié n'a accès qu'à l'authentification et aux contenus
  // publics en lecture (au lieu d'une garde recopiée route par route, oubliée sur certaines)
  const MFA_FREE_READ =
    /^\/api\/v1\/(health|config|levels|units|packs|quran|booklets|hifz\/books|pays|public)(\/|\?|$)/;
  app.addHook('preHandler', async (req, reply) => {
    const a = req.auth;
    if (!a || !requiresMfa(a.kind) || a.mfaVerified) return;
    const path = req.url;
    if (path.startsWith('/api/v1/auth/')) return;
    if ((req.method === 'GET' || req.method === 'HEAD') && MFA_FREE_READ.test(path)) return;
    return err(reply, 403, a.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  });

  const needAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (requiresMfa(req.auth.kind) && !req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const needParent = async (req: FastifyRequest, reply: FastifyReply) => {
    await needAuth(req, reply);
    if (reply.sent) return;
    if (req.auth?.kind !== 'parent') return err(reply, 403, 'reserve_aux_parents');
  };

  const setSession = async (reply: FastifyReply, accountId: string, kind: string, mfa: boolean) => {
    const s = await createSession(db, accountId, kind, mfa);
    reply.header('Set-Cookie', sessionCookie(s.token, s.ttl, secureFor(reply.request)));
  };

  /**
   * Ressaisie du mot de passe (changement, code parent, profil d'enfant, suppression — audit SEC-6) : essais
   * RÉSERVÉS par compte, verrou après 10 échecs ; la réponse d'erreur est envoyée ici (renvoie false).
   */
  const passwordOk = async (
    reply: FastifyReply,
    a: { id: string; passwordHash: string | null },
    given: string,
  ): Promise<boolean> => {
    const key = `mdp:${a.id}`;
    if (!(await reserveAttempt(db, key, 10))) {
      // une réponse Fastify est « thenable » : ne jamais l'attendre ici
      void err(reply, 429, 'verrouille');
      return false;
    }
    if (!(await verifySecret(given, a.passwordHash))) {
      await failAttempt(db, key, 10);
      void err(reply, 401, 'mot_de_passe_incorrect');
      return false;
    }
    await clearFailures(db, key);
    return true;
  };

  const me = async (accountId: string, mfaVerified: boolean) => {
    const [a] = await db.select().from(t.account).where(eq(t.account.id, accountId));
    if (!a) return null;
    const profiles = await db
      .select({
        id: t.profile.id,
        kind: t.profile.kind,
        pseudonym: t.profile.pseudonym,
        birthYear: t.profile.birthYear,
        avatar: t.profile.avatar,
        levelCode: t.profile.levelCode,
      })
      .from(t.profile)
      .where(eq(t.profile.ownerAccountId, accountId))
      .orderBy(asc(t.profile.createdAt));
    const [local = '', domain = ''] = (a.email ?? '').split('@');
    return {
      account: {
        id: a.id,
        kind: a.kind,
        email: a.email ? `${local.slice(0, 2)}…@${domain}` : null,
        country: a.country,
        locale: a.locale,
        totpEnabled: a.totpEnabled,
        hasPin: !!a.parentPinHash,
        createdAt: a.createdAt,
      },
      profiles,
      mfaRequired: requiresMfa(a.kind),
      mfaVerified,
    };
  };

  const insertConsents = async (
    accountId: string,
    types: string[],
    country: string,
    profileId: string | null = null,
    evidence: unknown = null,
  ) => {
    if (types.length)
      await db.insert(t.consent).values(
        types.map((type) => ({
          accountId,
          profileId,
          type,
          textVersion: TEXT_VERSION,
          country,
          evidence,
        })),
      );
  };

  // ---------------------------------------------------------------- inscription

  app.post<{
    Body: {
      kind: 'parent' | 'adulte';
      email: string;
      password: string;
      country: string;
      locale?: string;
      birthYear?: number;
      pseudonym?: string;
      consents: string[];
    };
  }>(
    '/api/v1/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['kind', 'email', 'password', 'country', 'consents'],
          additionalProperties: false,
          properties: {
            kind: { enum: ['parent', 'adulte'] },
            email: { type: 'string', maxLength: 254, pattern: EMAIL },
            password: { type: 'string', maxLength: MAX_LENGTH * 4 },
            country: { type: 'string', pattern: COUNTRY },
            locale: { type: 'string', maxLength: 10 },
            birthYear: YEAR,
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            consents: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      // audit MIN-15 : pays existant (ISO 3166-1) seulement
      if (!isCountry(b.country)) return err(reply, 400, 'pays_inconnu');
      const ipKey = `signup:${req.ip}`;
      if (await lockedUntil(db, ipKey)) return err(reply, 429, 'trop_de_demandes');
      await recordFailure(db, ipKey, SIGNUPS_PER_HOUR); // au plus 20 inscriptions par heure et par adresse, puis pause
      const email = b.email.trim().toLowerCase();
      const pb = checkPassword(b.password, email);
      if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      // audit MIN-3 : année de naissance obligatoire pour TOUT titulaire ; un parent doit être majeur
      if (!b.birthYear) return err(reply, 400, 'annee_naissance_requise');
      const age = ageFromYear(b.birthYear);
      if (b.kind === 'parent' && age < 18) return err(reply, 403, 'majorite_requise');
      if (b.kind === 'adulte' && age < consentAge(b.country))
        return err(reply, 403, 'age_parent_requis', { age: consentAge(b.country) });
      const missing = requiredAccountConsents(b.country).filter((c) => !b.consents.includes(c));
      if (missing.length) return err(reply, 400, 'consentement_requis', { missing });
      const exists = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(eq(t.account.email, email));
      if (exists[0]) return err(reply, 409, 'email_indisponible');
      const [a] = await db
        .insert(t.account)
        .values({
          kind: b.kind,
          email,
          passwordHash: await hashSecret(b.password),
          passwordChangedAt: new Date(),
          country: b.country,
          locale: b.locale ?? 'fr',
          birthYear: b.kind === 'adulte' ? (b.birthYear ?? null) : null,
        })
        .returning({ id: t.account.id });
      if (!a) throw new Error('création du compte impossible');
      const accepted = b.consents.filter(
        (c) =>
          requiredAccountConsents(b.country).includes(c as ConsentType) || OPTIONAL_CONSENTS.has(c),
      );
      // preuve : la règle du pays sous laquelle l'accord a été donné (loi et autorité, lot 17)
      const rules = countryRules(b.country);
      await insertConsents(a.id, accepted, b.country, null, {
        loi: rules.law,
        autorite: rules.authority,
        // audit MIN-3 : le parent déclare être majeur (année de naissance contrôlée)
        ...(b.kind === 'parent' ? { majoriteDeclaree: true } : {}),
      });
      if (b.kind === 'adulte')
        await db.insert(t.profile).values({
          ownerAccountId: a.id,
          // audit MIN-1 : un titulaire de moins de 18 ans a un profil « ado » (protections des mineurs)
          kind: ageFromYear(b.birthYear!) < 18 ? 'ado' : 'adulte',
          pseudonym: b.pseudonym ?? 'Moi',
          birthYear: b.birthYear ?? null,
          avatar: 'lune',
        });
      await audit(db, a.id, 'compte.creation', a.id, { kind: b.kind, country: b.country });
      await setSession(reply, a.id, b.kind, false);
      return reply.code(201).send(await me(a.id, false));
    },
  );

  // ---------------------------------------------------------------- connexion

  app.post<{ Body: { email: string; password: string; totp?: string } }>(
    '/api/v1/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254 },
            password: { type: 'string', maxLength: MAX_LENGTH * 4 },
            totp: { type: 'string', maxLength: 8 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      // audit SEC-2 : verrou par couple compte + adresse (personne ne peut verrouiller le compte d'autrui
      // depuis une autre adresse) ; l'essai est RÉSERVÉ atomiquement avant la vérification
      // audit MIN-7 : jamais l'adresse e-mail en clair dans la table des verrous
      const accKey = `login:${emailKey(email)}|${req.ip}`;
      const ipKey = `login-ip:${req.ip}`;
      const locked = (await lockedUntil(db, accKey)) ?? (await lockedUntil(db, ipKey));
      if (locked) return err(reply, 429, 'verrouille', { jusqua: locked.toISOString() });
      if (!(await reserveAttempt(db, accKey))) return err(reply, 429, 'verrouille');
      const [a] = await db
        .select()
        .from(t.account)
        .where(and(eq(t.account.email, email), isNull(t.account.deletedAt)));
      const ok = await verifySecret(req.body.password, a?.passwordHash);
      if (!a || !ok) {
        await failAttempt(db, accKey);
        await recordFailure(db, ipKey, 30);
        await audit(db, a?.id ?? null, 'connexion.echec', null, {
          email: a ? undefined : 'inconnu',
        });
        return err(reply, 401, 'identifiants_incorrects');
      }
      let mfa = false;
      if (requiresMfa(a.kind) && a.totpEnabled) {
        if (!req.body.totp) return err(reply, 401, 'totp_requis');
        if (!opts.secretKey) return err(reply, 503, 'deux_facteurs_indisponible');
        const counter = verifyTotp(decrypt(a.totpSecretEnc ?? '', opts.secretKey), req.body.totp);
        if (counter === null || (a.totpLastCounter !== null && counter <= a.totpLastCounter)) {
          await failAttempt(db, accKey);
          return err(reply, 401, 'totp_incorrect');
        }
        // audit SEC-5 : consommation ATOMIQUE du pas de temps (connexions parallèles : une seule gagne)
        const won = await db
          .update(t.account)
          .set({ totpLastCounter: counter })
          .where(
            and(
              eq(t.account.id, a.id),
              sql`(${t.account.totpLastCounter} IS NULL OR ${t.account.totpLastCounter} < ${counter})`,
            ),
          )
          .returning({ id: t.account.id });
        if (!won.length) {
          await failAttempt(db, accKey);
          return err(reply, 401, 'totp_incorrect');
        }
        mfa = true;
      }
      await clearFailures(db, accKey);
      await audit(db, a.id, 'connexion.reussie', a.id);
      await setSession(reply, a.id, a.kind, mfa);
      return me(a.id, mfa);
    },
  );

  app.post('/api/v1/auth/logout', async (req, reply) => {
    if (req.auth) await revokeSession(db, req.auth.tokenHash);
    reply.header('Set-Cookie', clearCookie(secureFor(req)));
    return { ok: true };
  });

  app.post('/api/v1/auth/logout-all', { preHandler: needAuth }, async (req, reply) => {
    await revokeAll(db, req.auth!.accountId);
    await audit(db, req.auth!.accountId, 'sessions.revocation');
    reply.header('Set-Cookie', clearCookie(secureFor(req)));
    return { ok: true };
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    return me(req.auth.accountId, req.auth.mfaVerified);
  });

  app.post<{ Body: { current: string; next: string } }>(
    '/api/v1/auth/password',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['current', 'next'],
          additionalProperties: false,
          properties: {
            current: { type: 'string', maxLength: 512 },
            next: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.current))) return reply;
      const pb = checkPassword(req.body.next, a.email ?? '');
      if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      await db
        .update(t.account)
        .set({ passwordHash: await hashSecret(req.body.next), passwordChangedAt: new Date() })
        .where(eq(t.account.id, a.id));
      await revokeAll(db, a.id, req.auth!.tokenHash); // les autres appareils sont déconnectés
      await audit(db, a.id, 'mot_de_passe.changement');
      return { ok: true };
    },
  );

  /** Réinitialisation par e-mail : nécessite un fournisseur d'e-mail (secret) → désactivée pour l'instant. */
  app.post('/api/v1/auth/password-reset', async (_req, reply) =>
    err(reply, 503, 'reinitialisation_desactivee'),
  );

  // ---------------------------------------------------------------- second facteur (TOTP)

  const needSession = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
  };

  // audit SEC-1 : le nouveau secret reste EN ATTENTE ; il ne remplace l'actuel (et le second facteur reste
  // actif) qu'après confirmation par un code ; confirmation limitée en essais, anti-rejeu, autres sessions
  // révoquées à l'activation
  app.post('/api/v1/auth/totp/setup', { preHandler: needSession }, async (req, reply) => {
    if (!opts.secretKey) return err(reply, 503, 'deux_facteurs_indisponible');
    const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
    if (!a) return err(reply, 401, 'non_connecte');
    if (a.totpEnabled && !req.auth!.mfaVerified) return err(reply, 403, 'totp_requis');
    const secret = newTotpSecret();
    await db
      .update(t.account)
      .set({ totpPendingEnc: encrypt(secret, opts.secretKey) })
      .where(eq(t.account.id, a.id));
    const label = encodeURIComponent(`AWFORM:${a.email ?? a.id}`);
    return {
      secret,
      uri: `otpauth://totp/${label}?secret=${secret}&issuer=AWFORM&digits=6&period=30`,
    };
  });

  app.post<{ Body: { code: string } }>(
    '/api/v1/auth/totp/confirm',
    {
      preHandler: needSession,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: { code: { type: 'string', maxLength: 8 } },
        },
      },
    },
    async (req, reply) => {
      if (!opts.secretKey) return err(reply, 503, 'deux_facteurs_indisponible');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a?.totpPendingEnc) return err(reply, 400, 'totp_non_prepare');
      const key = `totp:${a.id}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      if (!(await reserveAttempt(db, key))) return err(reply, 429, 'verrouille');
      const counter = verifyTotp(decrypt(a.totpPendingEnc, opts.secretKey), req.body.code);
      if (counter === null) {
        await failAttempt(db, key);
        return err(reply, 400, 'totp_incorrect');
      }
      await clearFailures(db, key);
      await db
        .update(t.account)
        .set({
          totpSecretEnc: a.totpPendingEnc,
          totpPendingEnc: null,
          totpEnabled: true,
          totpLastCounter: counter,
        })
        .where(eq(t.account.id, a.id));
      // les sessions ouvertes ailleurs (avant l'activation) sont révoquées ; celle-ci devient vérifiée
      await revokeAll(db, a.id, req.auth!.tokenHash);
      await db
        .update(t.session)
        .set({ mfaVerified: true })
        .where(eq(t.session.tokenHash, req.auth!.tokenHash));
      await audit(db, a.id, 'deux_facteurs.activation');
      return { ok: true };
    },
  );

  const kit: AuthKit = { db, needAuth, needParent, passwordOk, insertConsents, secureFor, me };
  registerProfiles(app, kit);
  registerPrivacy(app, kit);

  // ---------------------------------------------------------------- enseignant (lot 4 : accès sécurisé seulement)

  app.get('/api/v1/teacher/overview', { preHandler: needAuth }, async (req, reply) => {
    if (req.auth!.kind !== 'enseignant' && req.auth!.kind !== 'admin')
      return err(reply, 403, 'reserve_aux_enseignants');
    return { classes: [], message: 'classes_v1' };
  });

  // le nom du cookie est exporté pour les tests
  void COOKIE;
}

/** Le profil appartient-il au compte connecté ? (politique d'accès commune) */
export async function ownsProfile(db: Db, accountId: string, profileId: string): Promise<boolean> {
  const [p] = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(and(eq(t.profile.id, profileId), eq(t.profile.ownerAccountId, accountId)));
  return !!p;
}
