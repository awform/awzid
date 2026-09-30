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
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  deleteProfileRecitations,
  profileFreeAnswers,
  profileRecitations,
  exportPersonalData,
  leaveClass,
  schema as t,
  withdrawAccount,
  type Db,
} from '@awform/db';
import { decrypt, encrypt, hashSecret, newTotpSecret, verifySecret, verifyTotp } from './crypto.js';
import { checkPassword, MAX_LENGTH } from './passwords.js';
import {
  ageFromYear,
  consentAge,
  countryRules,
  COUNTRY_CODE,
  isCountry,
  lawEvidence,
  requiredAccountConsents,
  requiredChildConsents,
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

const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });

const EMAIL = '^[^\\s@]{1,64}@[^\\s@]{1,190}\\.[^\\s@]{2,24}$';
const COUNTRY = '^[A-Z]{2}$';
const YEAR = { type: 'integer', minimum: 1900, maximum: 2100 } as const;
/** empreinte de l'adresse e-mail pour les clés de verrou (audit MIN-7) */
const emailKey = (email: string) => createHash('sha256').update(email).digest('hex').slice(0, 32);
/** consentements facultatifs (retirables) ; « partage_enseignant » : suivi du hifẓ par l'enseignant d'une classe */
const OPTIONAL_CONSENTS: ReadonlySet<string> = new Set([
  'rappels',
  'partage_enseignant',
  // audit MIN-4 : l'accord au tuteur IA se retire aussi depuis « mes accords »
  'tuteur_ia',
  // lot 16 : envoi d'une récitation à l'enseignant de la classe (choix de la famille)
  'envoi_recitation',
]);
/** inscriptions par heure et par adresse IP (réglable pour les tests de bout en bout) */
const SIGNUPS_PER_HOUR = Number(process.env.AWFORM_SIGNUP_PER_HOUR ?? 20) || 20;
const AVATARS = ['etoile', 'lune', 'soleil', 'feuille', 'goutte', 'livre'];

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

  // ---------------------------------------------------------------- profils

  app.get('/api/v1/profiles', { preHandler: needAuth }, async (req) => {
    const m = await me(req.auth!.accountId, req.auth!.mfaVerified);
    return { profiles: m?.profiles ?? [] };
  });

  app.post<{
    Body: {
      pseudonym: string;
      birthYear: number;
      avatar?: string;
      levelCode?: string;
      password: string;
      consents: string[];
    };
  }>(
    '/api/v1/profiles',
    {
      preHandler: needParent,
      schema: {
        body: {
          type: 'object',
          required: ['pseudonym', 'birthYear', 'password', 'consents'],
          additionalProperties: false,
          properties: {
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            birthYear: YEAR,
            avatar: { enum: AVATARS },
            levelCode: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
            password: { type: 'string', maxLength: 512 },
            consents: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const accountId = req.auth!.accountId;
      const [a] = await db.select().from(t.account).where(eq(t.account.id, accountId));
      // vérification du parent : il ressaisit son mot de passe (preuve jointe au consentement)
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, b.password))) return reply;
      const age = ageFromYear(b.birthYear);
      if (age < 3) return err(reply, 400, 'annee_naissance_invalide');
      if (age >= 18) return err(reply, 400, 'adulte_compte_personnel');
      const country = a.country ?? '';
      const missing = requiredChildConsents(country, age).filter((c) => !b.consents.includes(c));
      if (missing.length) return err(reply, 400, 'consentement_requis', { missing });
      if (b.levelCode) {
        const lv = await db
          .select({ c: t.level.code })
          .from(t.level)
          .where(eq(t.level.code, b.levelCode));
        if (!lv[0]) return err(reply, 400, 'niveau_inconnu');
      }
      const [p] = await db
        .insert(t.profile)
        .values({
          ownerAccountId: accountId,
          kind: age < 13 ? 'enfant' : 'ado',
          pseudonym: b.pseudonym.trim(),
          birthYear: b.birthYear,
          avatar: b.avatar ?? 'etoile',
          levelCode: b.levelCode ?? null,
        })
        .returning({ id: t.profile.id });
      if (!p) throw new Error('création du profil impossible');
      await db
        .insert(t.guardianship)
        .values({ parentAccountId: accountId, profileId: p.id, consentAt: new Date() });
      const evidence = {
        methode: 'reauthentification_mot_de_passe+declaration',
        date: new Date().toISOString(),
        age_declare: age,
        // audit MIN-17 : règles du pays appliquées aux profils
        ...lawEvidence(country),
      };
      await insertConsents(
        accountId,
        b.consents.filter(
          (c) =>
            requiredChildConsents(country, age).includes(c as ConsentType) ||
            OPTIONAL_CONSENTS.has(c),
        ),
        country,
        p.id,
        evidence,
      );
      await audit(db, accountId, 'profil.creation', p.id, { age, country });
      return reply.code(201).send({ id: p.id });
    },
  );

  const ownProfile = async (accountId: string, profileId: string) => {
    const [p] = await db
      .select()
      .from(t.profile)
      .where(and(eq(t.profile.id, profileId), eq(t.profile.ownerAccountId, accountId)));
    return p ?? null;
  };

  app.patch<{
    Params: { id: string };
    Body: { pseudonym?: string; avatar?: string; levelCode?: string };
  }>(
    '/api/v1/profiles/:id',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            avatar: { enum: AVATARS },
            levelCode: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await ownProfile(req.auth!.accountId, req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      await db
        .update(t.profile)
        .set({
          pseudonym: req.body.pseudonym ?? p.pseudonym,
          avatar: req.body.avatar ?? p.avatar,
          levelCode: req.body.levelCode ?? p.levelCode,
        })
        .where(eq(t.profile.id, p.id));
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string }; Body: { password: string } }>(
    '/api/v1/profiles/:id',
    {
      preHandler: needParent,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['password'],
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const p = await ownProfile(a.id, req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      await db.delete(t.attempt).where(eq(t.attempt.profileId, p.id));
      await db.delete(t.progress).where(eq(t.progress.profileId, p.id));
      await db.delete(t.profile).where(eq(t.profile.id, p.id)); // tutelle et consentements en cascade
      await audit(db, a.id, 'profil.suppression', p.id);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- code parent (appareil partagé)

  app.post<{ Body: { pin: string; password: string } }>(
    '/api/v1/account/pin',
    {
      // code parent (ou code de l'enseignant / de l'adulte) : protège les réglages d'un appareil partagé
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['pin', 'password'],
          properties: {
            pin: { type: 'string', pattern: '^[0-9]{4}$' },
            password: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      await db
        .update(t.account)
        .set({ parentPinHash: await hashSecret(req.body.pin) })
        .where(eq(t.account.id, a.id));
      await audit(db, a.id, 'code_parent.definition');
      return { ok: true };
    },
  );

  app.post<{ Body: { pin: string } }>(
    '/api/v1/account/pin/verify',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['pin'],
          properties: { pin: { type: 'string', maxLength: 8 } },
        },
      },
    },
    async (req, reply) => {
      const key = `pin:${req.auth!.accountId}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a?.parentPinHash) return err(reply, 400, 'code_parent_absent');
      // audit SEC-2 : essai réservé atomiquement avant la vérification (pas de salve)
      if (!(await reserveAttempt(db, key))) return err(reply, 429, 'verrouille');
      if (!(await verifySecret(req.body.pin, a.parentPinHash))) {
        await failAttempt(db, key);
        return err(reply, 401, 'code_parent_incorrect');
      }
      await clearFailures(db, key);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- droits RGPD

  // règles du pays (public) : âge, accords obligatoires, loi applicable et autorité de contrôle (lot 17)
  app.get<{ Params: { code: string } }>('/api/v1/pays/:code/regles', async (req, reply) => {
    if (!COUNTRY_CODE.test(req.params.code) || !isCountry(req.params.code))
      return err(reply, 400, 'pays_invalide');
    reply.header('Cache-Control', 'public, max-age=3600');
    return countryRules(req.params.code);
  });

  app.get('/api/v1/account/consents', { preHandler: needAuth }, async (req) => {
    const rows = await db
      .select({
        id: t.consent.id,
        type: t.consent.type,
        profileId: t.consent.profileId,
        textVersion: t.consent.textVersion,
        givenAt: t.consent.givenAt,
        withdrawnAt: t.consent.withdrawnAt,
      })
      .from(t.consent)
      .where(eq(t.consent.accountId, req.auth!.accountId))
      .orderBy(asc(t.consent.givenAt));
    return { consents: rows.map((c) => ({ ...c, optional: OPTIONAL_CONSENTS.has(c.type) })) };
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/account/consents/:id/withdraw',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const [c] = await db
        .select()
        .from(t.consent)
        .where(and(eq(t.consent.id, req.params.id), eq(t.consent.accountId, req.auth!.accountId)));
      if (!c) return err(reply, 404, 'introuvable');
      // un consentement nécessaire au service se retire en supprimant le profil ou le compte
      if (!OPTIONAL_CONSENTS.has(c.type)) return err(reply, 409, 'consentement_necessaire');
      await db.update(t.consent).set({ withdrawnAt: new Date() }).where(eq(t.consent.id, c.id));
      // retrait du partage avec l'enseignant : le profil quitte ses classes
      if (c.type === 'partage_enseignant' && c.profileId) {
        // départ de TOUTES les classes (liste, registre, réponses, copies, récitations envoyées — audit
        // MIN-11 : rien ne réapparaît chez l'enseignant après une nouvelle inscription)
        const pid = c.profileId;
        const classes = new Set([
          ...(
            await db
              .select({ c: t.classMember.classId })
              .from(t.classMember)
              .where(eq(t.classMember.profileId, pid))
          ).map((x) => x.c),
          ...(
            await db
              .select({ c: t.classPupil.classId })
              .from(t.classPupil)
              .where(eq(t.classPupil.profileId, pid))
          ).map((x) => x.c),
        ]);
        for (const cl of classes) await leaveClass(db, cl, pid);
        await deleteProfileRecitations(db, pid);
      }
      // audit MIN-9 : retrait des rappels — préférences coupées, abonnements de l'appareil effacés
      if (c.type === 'rappels') {
        await db
          .update(t.notificationPref)
          .set({ devoirs: false, rapport: false, enfants: false, updatedAt: new Date() })
          .where(eq(t.notificationPref.accountId, req.auth!.accountId));
        await db
          .delete(t.pushSubscription)
          .where(eq(t.pushSubscription.accountId, req.auth!.accountId));
      }
      // retrait de l'accord d'envoi : les récitations déjà envoyées sont effacées
      if (c.type === 'envoi_recitation' && c.profileId)
        await deleteProfileRecitations(db, c.profileId);
      await audit(db, req.auth!.accountId, 'consentement.retrait', c.id, { type: c.type });
      return { ok: true };
    },
  );

  /** Export de TOUTES les données du compte (RGPD art. 15 et 20) : fichier JSON. */
  app.get('/api/v1/account/export', { preHandler: needAuth }, async (req, reply) => {
    const id = req.auth!.accountId;
    const [a] = await db.select().from(t.account).where(eq(t.account.id, id));
    const profiles = await db.select().from(t.profile).where(eq(t.profile.ownerAccountId, id));
    const ids = profiles.map((p) => p.id);
    const attempts = [];
    const progress = [];
    const hifzPlans = [];
    const hifzEvents = [];
    const classes = [];
    const practice = [];
    const carnets = [];
    const sourates = [];
    const recitations = [];
    const freeAnswers = [];
    for (const pid of ids) {
      // récitations envoyées : métadonnées et note (l'audio chiffré se télécharge depuis l'application)
      recitations.push(...(await profileRecitations(db, pid)));
      freeAnswers.push(...(await profileFreeAnswers(db, pid)));
      attempts.push(...(await db.select().from(t.attempt).where(eq(t.attempt.profileId, pid))));
      progress.push(...(await db.select().from(t.progress).where(eq(t.progress.profileId, pid))));
      hifzPlans.push(...(await db.select().from(t.hifzPlan).where(eq(t.hifzPlan.profileId, pid))));
      hifzEvents.push(
        ...(await db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, pid))),
      );
      practice.push(
        ...(await db.select().from(t.practiceEvent).where(eq(t.practiceEvent.profileId, pid))),
      );
      classes.push(
        ...(await db.select().from(t.classMember).where(eq(t.classMember.profileId, pid))),
      );
      // lot 22 : carnet de pratique (cases et signatures) et suivi des sourates
      carnets.push(
        ...(await db.select().from(t.practiceCheck).where(eq(t.practiceCheck.profileId, pid))),
        ...(await db
          .select()
          .from(t.practiceSignature)
          .where(eq(t.practiceSignature.profileId, pid))),
      );
      sourates.push(
        ...(await db.select().from(t.suraProgress).where(eq(t.suraProgress.profileId, pid))),
      );
    }
    const consents = await db.select().from(t.consent).where(eq(t.consent.accountId, id));
    const sessions = await db
      .select({
        createdAt: t.session.createdAt,
        expiresAt: t.session.expiresAt,
        revokedAt: t.session.revokedAt,
      })
      .from(t.session)
      .where(eq(t.session.accountId, id));
    await audit(db, id, 'donnees.export');
    reply
      .header('Content-Disposition', `attachment; filename="awform-mes-donnees.json"`)
      .type('application/json; charset=utf-8');
    return {
      exporteLe: new Date().toISOString(),
      compte: {
        id: a?.id,
        type: a?.kind,
        email: a?.email,
        pays: a?.country,
        langue: a?.locale,
        anneeNaissance: a?.birthYear,
        creeLe: a?.createdAt,
        deuxFacteurs: a?.totpEnabled,
      },
      profils: profiles,
      consentements: consents,
      progression: progress,
      reponses: attempts,
      hifz: { plans: hifzPlans, journal: hifzEvents, classes },
      entrainement: practice,
      carnetDePratique: carnets,
      suiviDesSourates: sourates,
      recitationsEnvoyees: recitations,
      reponsesLibres: freeAnswers,
      notifications: await db
        .select()
        .from(t.notificationPref)
        .where(eq(t.notificationPref.accountId, id)),
      sessions,
      // audit MIN-6 : toutes les tables rattachées à la personne, découvertes depuis le schéma
      donnees: await exportPersonalData(db, id),
    };
  });

  /** Suppression du compte : immédiate pour l'accès, effacement définitif sous 30 jours (purge). */
  app.post<{ Body: { password: string } }>(
    '/api/v1/account/delete',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['password'],
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      // audit MIN-14 : l'adresse e-mail est effacée AUSSITÔT (réinscription possible, rien à deviner pendant
      // les 30 jours qui précèdent l'effacement définitif)
      await db
        .update(t.account)
        .set({ deletedAt: new Date(), email: null })
        .where(eq(t.account.id, a.id));
      await withdrawAccount(db, a.id);
      await revokeAll(db, a.id);
      await audit(db, a.id, 'compte.suppression_demandee');
      reply.header('Set-Cookie', clearCookie(secureFor(req)));
      return { ok: true, effacementDefinitif: new Date(Date.now() + 30 * 86400_000).toISOString() };
    },
  );

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
