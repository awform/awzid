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
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  accountRoles,
  attachInvitation,
  attribuerGroupeBeta,
  canActForProfile,
  checkInvitation,
  countComptes,
  flagContext,
  invitationAssistee,
  invitationGroupe,
  readAcces,
  ROLE_BETA_FERMEE,
  releaseInvitation,
  reserveInvitation,
  normSource,
  sourceDeLInvitation,
  grantAccountRole,
  schema as t,
  schoolsOf,
  setProfileEvalMode,
  visibleProfiles,
  type Db,
} from '@awform/db';
import type { EtatFonction } from '@awform/school';
import { decrypt, encrypt, hashSecret, newTotpSecret, verifySecret, verifyTotp } from './crypto.js';
import { verifierJeton } from '../antibot.js';
import { checkPassword, estPersonnel, identifiantsDuCompte, MAX_LENGTH } from './passwords.js';
import {
  ageFromYear,
  closedForAge,
  consentAge,
  countryRules,
  isCountry,
  normRegion,
  normTz,
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
  ESSAIS_CONNEXION,
  essaisRestants,
  leverPauseSiMotDePasseChange,
  MAX_FAILURES,
  PAUSE_CONNEXION_MIN,
  lockedUntil,
  lookupSession,
  readCookie,
  recordFailure,
  revokeAll,
  revokeSession,
  sessionCookie,
  STAFF_ROLES,
  isTeacher,
  type AuthCtx,
} from './service.js';

const STAFF_SET = new Set<string>(STAFF_ROLES);

import {
  COUNTRY,
  ECHECS_CONNEXION_ADRESSE,
  EMAIL,
  emailKey,
  err,
  OPTIONAL_CONSENTS,
  REGION,
  INVITATION_TRIES_PER_HOUR,
  SIGNUPS_PER_HOUR,
  TZ,
  YEAR,
  type AuthKit,
} from './common.js';
import { fonctionActive } from '@awform/school';
import { readFlags } from '@awform/db';
import { missingConsents, registerConsents } from './accords.js';
import { registerPrivacy } from './donnees.js';
import { registerProfiles } from './profils.js';
import {
  enregistrerSessionLimitee,
  chercherEnfant,
  estIdentifiantEnfant,
  meEnfant,
  registerEnfantLogin,
} from './enfant-login.js';
import { registerRecovery } from './recuperation.js';
import { inactiveMailer, type Mailer } from '../mail/envoi.js';
import { demoLogin } from '../demo-mode.js';
import {
  masquerTelephone,
  normaliserTelephone,
  ressembleTelephone,
} from '@awform/school/telephone';
import type { ConfigGoogle } from '../identites/config.js';
import { dechiffrer, phoneHashOf } from '../identites/cles.js';
import { consommerDefi, type CtxTel } from '../identites/defis.js';
import {
  finInscriptionGoogle,
  inscriptionGoogle,
  lierGoogle,
  registerGoogle,
} from '../identites/google.js';
import type { Fetch } from '../identites/oidc.js';
import { DEFI_SCHEMA, registerTelephone } from '../identites/routes-telephone.js';
import { genererCodesSecours } from '../identites/secours.js';
import { renderMail } from '../mail/modeles.js';

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
  /** DÉMONSTRATION seulement (AWFORM_DEMO=1, garde-fou de démarrage) : identifiants courts (demo-mode.ts) */
  demoLogin?: boolean;
  /** lot F3 : envoi des e-mails (vérification, mot de passe oublié) ; absent : désactivé */
  mailer?: Mailer;
  /** lot F3 : adresse publique du site (liens des e-mails) */
  publicUrl?: string | null;
  /** 18/10/2026 : numéro WhatsApp (vérifications, expéditeur) ; null : inactif */
  telephone?: CtxTel | null;
  /** 18/10/2026 : « Continuer avec Google » ; null : inactif */
  google?: ConfigGoogle | null;
  /** tests : appels HTTP vers le fournisseur OpenID (jeton, clés publiques) */
  googleFetch?: Fetch;
}

export function registerAuth(app: FastifyInstance, opts: AuthOptions): void {
  const { db } = opts;
  const telCtx = opts.telephone?.cfg.actif ? opts.telephone : null;
  const googleCfg = opts.google?.actif ? opts.google : null;
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
    /^\/api\/v1\/(health|config|levels|units|packs|quran|booklets|hifz\/books|pays|public|contenu\/errata|contenu\/suspensions|acces\/statut)(\/|\?|$)/;
  app.addHook('preHandler', async (req, reply) => {
    const a = req.auth;
    if (!a || !requiresMfa(a.kind) || a.mfaVerified) return;
    const path = req.url;
    if (path.startsWith('/api/v1/auth/')) return;
    if ((req.method === 'GET' || req.method === 'HEAD') && MFA_FREE_READ.test(path)) return;
    return err(reply, 403, a.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  });

  // V2-3 : session d'un enfant = liste fermée de routes d'apprentissage, sur son seul profil
  enregistrerSessionLimitee(app);

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

  const me = async (
    accountId: string,
    mfaVerified: boolean,
    tablet: { classId: string } | null = null,
  ) => {
    const [a] = await db.select().from(t.account).where(eq(t.account.id, accountId));
    if (!a) return null;
    // lot F2 (revue E3, E4) : profils dont le compte est titulaire OU parent responsable (second parent) ;
    // en mode tablette : les élèves de la classe ; type enfant / ado / adulte recalculé depuis l'année
    const profiles = (await visibleProfiles(db, accountId, tablet)).map(({ lien, ...p }) => ({
      ...p,
      lien,
    }));
    const [local = '', domain = ''] = (a.email ?? '').split('@');
    // lot F3 (revue E10) : accords nécessaires manquants (premier usage) — jamais en mode tablette
    const accordsManquants = tablet ? [] : await missingConsents(db, accountId, a.kind);
    // lot F1 puis F2 (revue E2) : rôles multiples (plateforme, écoles), en plus du type du titulaire
    const roles = tablet ? [] : await accountRoles(db, accountId, a.kind);
    const ecoles = tablet
      ? []
      : (await schoolsOf(db, accountId)).map((s) => ({
          id: s.school.id,
          name: s.school.name,
          personal: s.school.personal,
          roles: s.roles,
        }));
    let tablette: { classId: string; className: string; school: string } | null = null;
    if (tablet) {
      const [c] = await db
        .select({ name: t.classGroup.name, school: t.school.name })
        .from(t.classGroup)
        .innerJoin(t.school, eq(t.school.id, t.classGroup.schoolId))
        .where(eq(t.classGroup.id, tablet.classId));
      tablette = { classId: tablet.classId, className: c?.name ?? '', school: c?.school ?? '' };
    }
    // lot 6 : le groupe « bêta fermée » voit le contenu différé de Madjaliss quand l'interrupteur
    // `beta_contenu_differe_visible` est allumé pour lui ; calculé ICI (jamais décidé par le navigateur), relu à chaque
    // requête de la route des fichiers gardés : un retrait du groupe ou l'interrupteur éteint coupe le droit aussitôt
    const mfaRequise = requiresMfa(a.kind) || roles.some((r) => STAFF_SET.has(r));
    let betaDiffere = false;
    if (!tablet && roles.includes(ROLE_BETA_FERMEE) && (!mfaRequise || mfaVerified)) {
      const ctx = await flagContext(db, {
        accountId,
        accountKind: a.kind,
        roles,
        country: a.country,
        profileId: null,
      });
      const f = await readFlags(db);
      betaDiffere = fonctionActive(
        'beta_contenu_differe_visible',
        ctx,
        f.etats['beta_contenu_differe_visible'] as EtatFonction | undefined,
        f.regles.filter((r) => r.cle === 'beta_contenu_differe_visible'),
      );
    }
    return {
      roles,
      betaDiffere,
      ecoles,
      tablette,
      account: {
        id: a.id,
        kind: a.kind,
        email: a.email ? `${local.slice(0, 2)}…@${domain}` : null,
        country: a.country,
        locale: a.locale,
        totpEnabled: a.totpEnabled,
        hasPin: !!a.parentPinHash,
        createdAt: a.createdAt,
        // lot F3 : adresse vérifiée, subdivision, fuseau, région d'hébergement des données ; 18/10/2026 : un compte
        // ouvert par numéro (sans adresse) est vérifié par son numéro
        emailVerified: !!a.emailVerifiedAt || (!a.email && !!a.phoneVerifiedAt),
        // 18/10/2026 : numéro (forme masquée), liaison Google, mot de passe défini ou non
        telephone: masquerTelephone(dechiffrer(opts.secretKey, a.phoneEnc)),
        google: !!(
          await db
            .select({ id: t.accountIdentity.id })
            .from(t.accountIdentity)
            .where(eq(t.accountIdentity.accountId, a.id))
            .limit(1)
        )[0],
        motDePasse: !!a.passwordHash,
        region: a.region,
        tz: a.tz,
        dataRegion: a.dataRegion,
      },
      accordsManquants,
      profiles,
      mfaRequired: mfaRequise,
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
      email?: string;
      password?: string;
      country: string;
      locale?: string;
      birthYear?: number;
      pseudonym?: string;
      consents: string[];
      evalMode?: 'verification' | 'serein';
      region?: string | null;
      tz?: string;
      invitation?: string;
      jeton?: string;
      site_web?: string;
      /** 18/10/2026 : inscription par numéro WhatsApp — vérification réussie du numéro */
      defi?: { id: string; jeton: string };
      /** 18/10/2026 : inscription avec l'identité Google vérifiée (cookie chiffré posé par le retour de Google) */
      google?: boolean;
      src?: string;
      intention?: t.SignupIntent;
    };
  }>(
    '/api/v1/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['kind', 'country', 'consents'],
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
            // A39 : l'adulte choisit sa façon d'avancer (modifiable ensuite dans son compte)
            evalMode: { enum: ['verification', 'serein'] },
            // lot F3 : subdivision (âge du consentement au Québec) et fuseau horaire de l'appareil
            region: REGION,
            tz: TZ,
            // bêta fermée : code d'invitation (obligatoire en mode « invitation », contrôlé s'il est donné)
            invitation: { type: 'string', minLength: 1, maxLength: 40 },
            // anti-robots (réglage « antibot ») : jeton signé émis à l'ouverture de la page, champ piège caché
            jeton: { type: 'string', maxLength: 100 },
            site_web: { type: 'string', maxLength: 200 },
            defi: DEFI_SCHEMA,
            google: { type: 'boolean' },
            // provenance (?src= des affiches) : gardée si elle est valide (^[a-z0-9-]{1,40}$), ignorée sinon
            src: { type: 'string', maxLength: 200 },
            // V2-2 : « Qui va apprendre ? » (facultatif ; absent = comportement d'avant)
            intention: { enum: [...t.SIGNUP_INTENTS] },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      // bêta fermée : site fermé → aucune inscription ; mode « invitation » → code valable exigé
      const acces = await readAcces(db);
      if (acces.site === 'ferme') return err(reply, 503, 'acces_ferme');
      if (acces.inscription === 'invitation' && !b.invitation)
        return err(reply, 403, 'invitation_requise');
      // anti-robots sans service tiers : champ piège vide, jeton signé ni trop récent (3 s) ni trop ancien (2 h)
      if (acces.antibot === 'on') {
        const verdict = b.site_web ? 'piege' : verifierJeton(opts.secretKey, b.jeton);
        if (verdict !== 'ok') return err(reply, 400, 'antibot_echec', { raison: verdict });
      }
      // mode « ouvert » : toujours sous un PLAFOND de comptes ; plein, l'inscription libre passe en liste d'attente
      // (une invitation valable reste acceptée)
      if (
        acces.inscription === 'ouverte' &&
        !b.invitation &&
        (await countComptes(db)) >= acces.plafond
      )
        return err(reply, 403, 'plafond_atteint');
      // 18/10/2026 : inscription ASSISTÉE (invitation préparée par un administrateur : type, pays, numéro)
      const assistee = b.invitation ? await invitationAssistee(db, b.invitation) : null;
      const country = assistee?.country ?? b.country;
      // V2-2 : l'intention fixe le type de compte (moi → adulte, enfants/famille → parent, élèves → enseignant) ;
      // une invitation assistée garde le type que l'administrateur a préparé
      const kind: t.AccountKind =
        assistee?.kind ?? (b.intention ? KIND_PAR_INTENTION[b.intention] : b.kind);
      // audit MIN-15 : pays existant (ISO 3166-1) seulement
      if (!isCountry(country)) return err(reply, 400, 'pays_inconnu');
      // UN identifiant : e-mail, numéro WhatsApp vérifié (ou préparé par l'administrateur), ou identité Google
      const g = b.google ? inscriptionGoogle(opts.secretKey, req) : null;
      if (b.google && (!googleCfg?.actif || !g)) return err(reply, 400, 'google_expire');
      // numéro préparé par l'administrateur (inscription assistée) : repris sur le compte, quel que soit le choix
      const parTelephone = !!b.defi || !!assistee?.phoneHash;
      if ([!!b.email, !!b.defi, !!b.google].filter(Boolean).length > 1)
        return err(reply, 400, 'identifiant_multiple');
      if (b.defi && !telCtx?.cfg.actif) return err(reply, 403, 'telephone_inactif');
      if (!b.email && !g && !parTelephone) return err(reply, 400, 'identifiant_requis');
      const ipKey = `signup:${req.ip}`;
      if (await lockedUntil(db, ipKey)) return err(reply, 429, 'trop_de_demandes');
      await recordFailure(db, ipKey, SIGNUPS_PER_HOUR); // au plus 20 inscriptions par heure et par adresse, puis pause
      const email = g ? g.email : (b.email?.trim().toLowerCase() ?? null);
      // contrôle (sans consommer) : un mauvais code est refusé tôt, avec une limite d'essais par adresse IP
      if (b.invitation) {
        const invKey = `invit:${req.ip}`;
        if (await lockedUntil(db, invKey)) return err(reply, 429, 'trop_de_demandes');
        const c = await checkInvitation(
          db,
          b.invitation,
          email,
          new Date(),
          b.defi ? null : (assistee?.phoneHash ?? null),
        );
        if (!c.ok) {
          await recordFailure(db, invKey, INVITATION_TRIES_PER_HOUR);
          return err(reply, 403, c.raison);
        }
      }
      // mot de passe : toujours, sauf avec Google (facultatif) ; règle du lot 11
      if (!b.password && !g) return err(reply, 400, 'mot_de_passe_requis');
      if (b.password) {
        // V2-1 : ni l'adresse, ni le prénom (pseudonyme) ne peuvent servir de mot de passe
        const pb = checkPassword(b.password, email ?? '', {
          identifiants: [b.pseudonym],
          // un enseignant suit la règle du personnel (12 caractères) ; le second facteur est exigé ensuite
          personnel: kind === 'enseignant',
        });
        if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      }
      // audit MIN-3 : année de naissance obligatoire pour TOUT titulaire ; un parent doit être majeur
      if (!b.birthYear) return err(reply, 400, 'annee_naissance_requise');
      const age = ageFromYear(b.birthYear);
      if ((kind === 'parent' || kind === 'enseignant') && age < 18)
        return err(reply, 403, 'majorite_requise');
      // Google : jamais pour un enfant ni un adolescent (titulaire majeur)
      if (g && age < 18) return err(reply, 403, 'google_majeur_requis');
      // lot F3 (revue M9) : subdivision connue pour ce pays (sinon refus : âge du consentement en jeu)
      const region = normRegion(country, b.region);
      if (b.region && !region) return err(reply, 400, 'region_inconnue');
      // lot F3 (revue G3) : États-Unis, moins de 13 ans : fermé au lancement (message clair)
      if (closedForAge(country, age))
        return err(reply, 403, 'ferme_moins_13', { age: 13, pays: country });
      if (kind === 'adulte' && age < consentAge(country, region))
        return err(reply, 403, 'age_parent_requis', { age: consentAge(country, region) });
      const missing = requiredAccountConsents(country).filter((c) => !b.consents.includes(c));
      if (missing.length) return err(reply, 400, 'consentement_requis', { missing });
      if (email) {
        const exists = await db
          .select({ id: t.account.id })
          .from(t.account)
          .where(eq(t.account.email, email));
        if (exists[0]) return err(reply, 409, 'email_indisponible');
      }
      // numéro : la vérification réussie est UTILISÉE ici (après tous les autres contrôles) ; l'unicité n'est dite
      // qu'à qui a prouvé le numéro (aucune énumération possible)
      let tel: { phoneHash: string; phoneEnc: string } | null = null;
      if (b.defi) {
        const v = await consommerDefi(telCtx!, b.defi, 'inscription');
        if (!v) return err(reply, 400, 'verification_invalide');
        tel = v;
      } else if (assistee?.phoneHash && assistee.phoneEnc)
        tel = { phoneHash: assistee.phoneHash, phoneEnc: assistee.phoneEnc };
      if (tel) {
        const [pris] = await db
          .select({ id: t.account.id })
          .from(t.account)
          .where(eq(t.account.phoneHash, tel.phoneHash));
        if (pris) return err(reply, 409, 'telephone_indisponible');
      }
      // bêta fermée : l'usage de l'invitation est RÉSERVÉ de façon atomique juste avant la création du compte
      // (deux inscriptions simultanées ne peuvent pas dépasser le nombre d'usages) ; rendu si la création échoue
      let invitationId: string | null = null;
      if (b.invitation) {
        const r = await reserveInvitation(
          db,
          b.invitation,
          email,
          new Date(),
          tel?.phoneHash ?? null,
        );
        if (!r.ok) return err(reply, 403, r.raison);
        invitationId = r.id;
      }
      // provenance : celle de la navigation (?src=), sinon celle de la demande de liste d'attente qui a donné l'invitation
      const source =
        normSource(b.src) ?? (invitationId ? await sourceDeLInvitation(db, invitationId) : null);
      let a: { id: string } | undefined;
      try {
        [a] = await db
          .insert(t.account)
          .values({
            kind,
            email,
            passwordHash: b.password ? await hashSecret(b.password) : null,
            passwordChangedAt: b.password ? new Date() : null,
            country,
            locale: b.locale ?? 'fr',
            birthYear: kind === 'adulte' ? (b.birthYear ?? null) : null,
            signupIntent: b.intention ?? null,
            region,
            tz: normTz(b.tz),
            // Google : adresse vérifiée par Google (email_verified) ; numéro : prouvé (ou préparé par l'administrateur)
            emailVerifiedAt: g ? new Date() : null,
            phoneEnc: tel?.phoneEnc ?? null,
            phoneHash: tel?.phoneHash ?? null,
            phoneVerifiedAt: tel ? new Date() : null,
            lastLoginAt: new Date(),
            source,
          })
          .returning({ id: t.account.id });
      } catch (e) {
        if (invitationId) await releaseInvitation(db, invitationId);
        throw e;
      }
      if (!a) throw new Error('création du compte impossible');
      if (invitationId) await attachInvitation(db, invitationId, a.id);
      // lot 6 : une invitation de groupe inscrit le compte dans le groupe « bêta fermée » (journalisé)
      if (invitationId && (await invitationGroupe(db, invitationId)) === 'beta_fermee') {
        await attribuerGroupeBeta(db, a.id);
        await audit(db, a.id, 'groupe_beta.ajout_invitation', invitationId);
      }
      // lot F2 (revue E2) : rôle du titulaire (un même compte pourra recevoir ensuite d'autres rôles)
      await grantAccountRole(
        db,
        a.id,
        kind === 'parent' ? 'parent' : kind === 'enseignant' ? 'enseignant' : 'eleve_adulte',
      );
      const accepted = b.consents.filter(
        (c) =>
          requiredAccountConsents(country).includes(c as ConsentType) || OPTIONAL_CONSENTS.has(c),
      );
      // preuve : la règle du pays sous laquelle l'accord a été donné (loi et autorité, lot 17)
      const rules = countryRules(country, region);
      await insertConsents(a.id, accepted, country, null, {
        loi: rules.law,
        autorite: rules.authority,
        // audit MIN-3 : le parent déclare être majeur (année de naissance contrôlée)
        ...(kind !== 'adulte' ? { majoriteDeclaree: true } : {}),
      });
      if (kind === 'adulte') {
        const [own] = await db
          .insert(t.profile)
          .values({
            ownerAccountId: a.id,
            // audit MIN-1 : un titulaire de moins de 18 ans a un profil « ado » (protections des mineurs)
            kind: ageFromYear(b.birthYear!) < 18 ? 'ado' : 'adulte',
            pseudonym: b.pseudonym ?? 'Moi',
            birthYear: b.birthYear ?? null,
            avatar: 'lune',
          })
          .returning({ id: t.profile.id });
        // A39 : « Avec vérification » ou « Mode serein », choisi à l'inscription
        // F5 : « Mode serein » coupé (interrupteur) → choix ignoré, le défaut s'applique
        const sereinOk =
          b.evalMode !== 'serein' ||
          fonctionActive(
            'mode_serein',
            {
              roles: ['eleve'],
              age: 'adulte',
              pays: country ?? null,
              ecoles: [],
              canal: 'production',
            },
            (await readFlags(db)).etats.mode_serein,
            (await readFlags(db)).regles.filter((r) => r.cle === 'mode_serein'),
          );
        if (b.evalMode && own && sereinOk)
          await setProfileEvalMode(db, own.id, b.evalMode, 'soi', a.id);
      }
      // Google : liaison enregistrée, l'identité en attente est effacée
      if (g) {
        await lierGoogle(db, a.id, g);
        reply.header('Set-Cookie', finInscriptionGoogle(secureFor(req)));
      }
      // numéro : 8 codes de récupération (montrés une fois, « à recopier sur papier »)
      const codesSecours =
        tel && opts.secretKey ? await genererCodesSecours(db, opts.secretKey, a.id) : null;
      await audit(db, a.id, 'compte.creation', a.id, {
        kind,
        country,
        via: g ? 'google' : tel ? 'telephone' : 'email',
        ...(assistee ? { assistee: true } : {}),
        ...(invitationId ? { invitation: invitationId } : {}),
      });
      // lot F3 (revue M7) : lien de vérification de l'adresse (envoyé après la réponse)
      if (email && !g) kit.sendVerification?.(a.id, email, b.locale ?? 'fr');
      await setSession(reply, a.id, kind, false);
      return reply
        .code(201)
        .send({ ...(await me(a.id, false)), ...(codesSecours ? { codesSecours } : {}) });
    },
  );

  // ---------------------------------------------------------------- connexion

  app.post<{
    Body: {
      email: string;
      password: string;
      totp?: string;
      pays?: string;
      defi?: { id: string; jeton: string };
    };
  }>(
    '/api/v1/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            // « e-mail ou numéro » (18/10/2026) : le même champ
            email: { type: 'string', maxLength: 254 },
            password: { type: 'string', maxLength: MAX_LENGTH * 4 },
            totp: { type: 'string', maxLength: 8 },
            // numéro écrit sans indicatif : lu dans ce pays (défaut : Sénégal)
            pays: { type: 'string', pattern: COUNTRY },
            // revérification du numéro après une longue absence (numéros recyclés)
            defi: DEFI_SCHEMA,
          },
        },
      },
    },
    async (req, reply) => {
      // identifiant : adresse e-mail, ou numéro (forme E.164 ; sans indicatif : pays donné, sinon Sénégal)
      const saisi = req.body.email.trim();
      const numero =
        ressembleTelephone(saisi) && opts.secretKey
          ? normaliserTelephone(saisi, req.body.pays ?? 'SN')
          : null;
      const e164 = numero?.ok ? numero.e164 : null;
      const email = e164 ?? saisi.toLowerCase();
      // audit SEC-2 : verrou par couple compte + adresse (personne ne peut verrouiller le compte d'autrui
      // depuis une autre adresse) ; l'essai est RÉSERVÉ atomiquement avant la vérification
      // audit MIN-7 : jamais l'adresse e-mail en clair dans la table des verrous
      const accKey = `login:${emailKey(email)}|${req.ip}`;
      // lot 9 (R6) : le verrou qui compte est celui du COUPLE compte + adresse (5 échecs) ; le compteur de l'adresse
      // SEULE n'est plus qu'un filet contre la pulvérisation de mots de passe (beaucoup de comptes depuis une adresse),
      // assez haut pour qu'une classe derrière une même adresse ne soit jamais bloquée par les erreurs de ses élèves
      // (30 élèves × 5 erreurs = 150 < 300 par heure) ; réglable : AWFORM_ECHECS_CONNEXION_ADRESSE
      const ipKey = `login-ip:${req.ip}`;
      const chercher = () =>
        db
          .select()
          .from(t.account)
          .where(
            and(
              e164
                ? eq(t.account.phoneHash, phoneHashOf(opts.secretKey!, e164))
                : eq(t.account.email, email),
              isNull(t.account.deletedAt),
            ),
          );
      // V2-1 : la pause est levée si le mot de passe a été changé ou réinitialisé depuis le dernier essai
      // (« Mot de passe oublié ? » débloque tout de suite) ; réponse identique que le compte existe ou non
      const [a] = await chercher();
      // V2-3 : « identifiant » d'un enfant (même écran, même verrou, mêmes messages)
      const enf = estIdentifiantEnfant(saisi)
        ? await chercherEnfant(db, saisi.toLowerCase())
        : null;
      // V2-1 (décision du client) : 8 essais puis 10 minutes de pause ; le PERSONNEL garde 5 essais et la pause
      // progressive (1, 2, 4… minutes)
      const personnel = a ? await estPersonnel(db, a.id) : false;
      const max = personnel ? MAX_FAILURES : ESSAIS_CONNEXION;
      const pause = personnel ? undefined : PAUSE_CONNEXION_MIN;
      const infoPause = pause ? { pause_minutes: pause } : {};
      if (await lockedUntil(db, accKey))
        await leverPauseSiMotDePasseChange(
          db,
          accKey,
          enf?.passwordChangedAt ?? a?.passwordChangedAt,
        );
      const locked = (await lockedUntil(db, accKey)) ?? (await lockedUntil(db, ipKey));
      if (locked)
        return err(reply, 429, 'verrouille', { jusqua: locked.toISOString(), ...infoPause });
      if (!(await reserveAttempt(db, accKey, max, pause))) {
        const jusqua = await lockedUntil(db, accKey);
        return err(reply, 429, 'verrouille', {
          ...(jusqua ? { jusqua: jusqua.toISOString() } : {}),
          ...infoPause,
        });
      }
      // démonstration seulement : `parent`, `enfant`… + mot de passe court, sans second facteur ; jamais en
      // production (option absente : l'identifiant court ne correspond à aucune adresse et échoue plus bas)
      const demo = opts.demoLogin ? await demoLogin(db, email, req.body.password) : null;
      if (demo) {
        await clearFailures(db, accKey);
        // site fermé : la démonstration aussi (seul l'administrateur de démonstration passe)
        if (demo.kind !== 'admin' && (await readAcces(db)).site === 'ferme')
          return err(reply, 503, 'acces_ferme');
        await audit(db, demo.accountId, 'connexion.demo', demo.accountId);
        await setSession(reply, demo.accountId, demo.kind, true);
        return { ...(await me(demo.accountId, true)), profilDemo: demo.profileId };
      }
      const ok = await verifySecret(req.body.password, enf?.passwordHash ?? a?.passwordHash);
      if ((!a && !enf) || !ok) {
        await failAttempt(db, accKey, max, pause);
        await recordFailure(db, ipKey, ECHECS_CONNEXION_ADRESSE);
        await audit(db, a?.id ?? null, 'connexion.echec', null, {
          email: a ? undefined : 'inconnu',
        });
        // V2-1 : essais restants (0 = la pause commence, avec son heure de fin) ; la clé étant
        // « identifiant + adresse », la réponse est la même que l'identifiant existe ou non
        const restants = await essaisRestants(db, accKey, max);
        if (restants === 0) {
          const jusqua = await lockedUntil(db, accKey);
          return err(reply, 429, 'verrouille', {
            ...(jusqua ? { jusqua: jusqua.toISOString() } : {}),
            ...infoPause,
          });
        }
        return err(reply, 401, 'identifiants_incorrects', { essais_restants: restants });
      }
      if (enf) {
        // V2-3 : le titulaire du profil doit être actif (non supprimé, non bloqué) ; session limitée à CE profil
        const [o] = await db.select().from(t.account).where(eq(t.account.id, enf.ownerAccountId));
        if (!o || o.deletedAt || o.blockedAt) return err(reply, 401, 'identifiants_incorrects');
        if ((await readAcces(db)).site === 'ferme') return err(reply, 503, 'acces_ferme');
        await clearFailures(db, accKey);
        await audit(db, o.id, 'connexion.enfant', enf.profileId);
        const s = await createSession(db, o.id, o.kind, false, {
          profileId: enf.profileId,
          ttlMs: 7 * 24 * 3600_000,
        });
        reply.header('Set-Cookie', sessionCookie(s.token, s.ttl, secureFor(req)));
        return meEnfant(await me(o.id, false), enf.profileId);
      }
      if (!a) return err(reply, 401, 'identifiants_incorrects');
      // compte bloqué par l'administrateur : refus APRÈS la vérification du mot de passe (rien n'est révélé à qui
      // ne le connaît pas) ; aucune session n'est ouverte
      if (a.blockedAt) {
        await audit(db, a.id, 'connexion.refusee_bloque', a.id);
        return err(reply, 403, 'compte_bloque');
      }
      let mfa = false;
      const rolesDuCompte = await accountRoles(db, a.id, a.kind);
      // bêta fermée : site fermé → seuls les administrateurs se connectent (mot de passe déjà vérifié :
      // aucune information sur l'existence d'un compte n'est donnée aux autres)
      if (
        (await readAcces(db)).site === 'ferme' &&
        a.kind !== 'admin' &&
        !rolesDuCompte.includes('admin')
      ) {
        await clearFailures(db, accKey);
        return err(reply, 503, 'acces_ferme');
      }
      // lot F2 : un compte famille qui a aussi un rôle de personnel (parent ET enseignant) donne son second
      // facteur à la connexion s'il l'a activé ; sans lui, seuls les espaces de la famille lui sont ouverts
      const staffRoles = rolesDuCompte.some((r) => STAFF_SET.has(r));
      if ((requiresMfa(a.kind) || staffRoles) && a.totpEnabled) {
        if (!req.body.totp) return err(reply, 401, 'totp_requis');
        if (!opts.secretKey) return err(reply, 503, 'deux_facteurs_indisponible');
        const counter = verifyTotp(decrypt(a.totpSecretEnc ?? '', opts.secretKey), req.body.totp);
        if (counter === null || (a.totpLastCounter !== null && counter <= a.totpLastCounter)) {
          await failAttempt(db, accKey, max, pause);
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
          await failAttempt(db, accKey, max, pause);
          return err(reply, 401, 'totp_incorrect');
        }
        mfa = true;
      }
      await clearFailures(db, accKey);
      // 18/10/2026 : connexion PAR NUMÉRO après une longue absence → le numéro est revérifié (un numéro inutilisé
      // peut avoir été réattribué par l'opérateur) ; la page refait une vérification puis renvoie la connexion
      if (e164 && a.phoneHash && telCtx) {
        const dernier = Math.max(
          a.lastLoginAt?.getTime() ?? 0,
          a.phoneVerifiedAt?.getTime() ?? 0,
          a.createdAt.getTime(),
        );
        if (Date.now() - dernier > telCtx.cfg.reverifJours * 86_400_000) {
          if (!req.body.defi) return err(reply, 403, 'reverification_requise');
          const v = await consommerDefi(telCtx, req.body.defi, 'reverification');
          if (!v || v.phoneHash !== a.phoneHash) return err(reply, 400, 'verification_invalide');
          await db
            .update(t.account)
            .set({ phoneVerifiedAt: new Date() })
            .where(eq(t.account.id, a.id));
          await audit(db, a.id, 'telephone.reverification', a.id);
        }
      }
      await db.update(t.account).set({ lastLoginAt: new Date() }).where(eq(t.account.id, a.id));
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

  app.get<{ Querystring: { doux?: string } }>('/api/v1/auth/me', async (req, reply) => {
    // `?doux=1` : l'application demande « qui suis-je ? » dès l'ouverture, souvent sans session (visiteur, page de
    // connexion). Réponse 200 « anonyme » au lieu de 401, pour ne pas semer d'erreurs rouges dans la console du
    // navigateur. Sans ce paramètre, le comportement historique (401) est inchangé.
    if (!req.auth && req.query.doux === '1') return { anonyme: true };
    if (!req.auth) return err(reply, 401, 'non_connecte');
    const m = await me(req.auth.accountId, req.auth.mfaVerified, req.auth.tablet);
    return req.auth.profileId ? meEnfant(m, req.auth.profileId) : m;
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
      // lot 11 : règle des familles (8 caractères et 3 types, ou phrase de 12) ; personnel : 12 caractères au moins
      const pb = checkPassword(req.body.next, a.email ?? '', {
        personnel: await estPersonnel(db, a.id),
        identifiants: await identifiantsDuCompte(db, a.id),
      });
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

  const kit: AuthKit = {
    db,
    needAuth,
    needParent,
    passwordOk,
    insertConsents,
    secureFor,
    me,
    setSession,
    cle: opts.secretKey,
  };
  registerProfiles(app, kit);
  registerEnfantLogin(app, kit);
  registerPrivacy(app, kit);
  // lot F3 : récupération du compte (e-mails), accords et réglages du compte
  registerRecovery(app, kit, {
    mailer: opts.mailer ?? inactiveMailer,
    publicUrl: opts.publicUrl ?? null,
  });
  registerConsents(app, kit);
  // 18/10/2026 : numéro WhatsApp (vérification inversée, validation manuelle, codes de récupération) et Google
  registerTelephone(app, kit, telCtx, {
    key: opts.secretKey,
    notifierMdp: (to, locale) => {
      const m = opts.mailer;
      if (!m || m.mode === 'inactif') return;
      void m
        .send({
          to,
          kind: 'mot_de_passe_modifie',
          ...renderMail('mot_de_passe_modifie', locale, {}),
        })
        .catch(() => {});
    },
  });
  if (opts.google)
    registerGoogle(app, kit, {
      cfg: opts.google,
      key: opts.secretKey,
      fetchImpl: opts.googleFetch,
    });

  // ---------------------------------------------------------------- enseignant (lot 4 : accès sécurisé seulement)

  app.get('/api/v1/teacher/overview', { preHandler: needAuth }, async (req, reply) => {
    if (!isTeacher(req.auth) && req.auth!.kind !== 'admin')
      return err(reply, 403, 'reserve_aux_enseignants');
    return { classes: [], message: 'classes_v1' };
  });

  // le nom du cookie est exporté pour les tests
  void COOKIE;
}

/**
 * Le compte connecté peut-il agir pour ce profil ? (politique d'accès commune) — lot F2 : titulaire OU parent
 * responsable actif (second parent) ; session de tablette de classe : élèves de cette classe seulement. Le
 * compte technique d'une école n'agit JAMAIS hors d'une session de tablette.
 */
/** V2-2 : type de compte créé par chaque intention. */
const KIND_PAR_INTENTION: Record<t.SignupIntent, t.AccountKind> = {
  moi: 'adulte',
  enfants: 'parent',
  famille: 'parent',
  eleves: 'enseignant',
};

export async function ownsProfile(
  db: Db,
  who: AuthCtx | string | null | undefined,
  profileId: string,
): Promise<boolean> {
  if (!who) return false;
  if (typeof who !== 'string') {
    if (who.kind === 'ecole' && !who.tablet) return false;
    return canActForProfile(db, who.accountId, profileId, who.tablet);
  }
  const [a] = await db
    .select({ kind: t.account.kind })
    .from(t.account)
    .where(eq(t.account.id, who));
  if (!a || a.kind === 'ecole') return false;
  return canActForProfile(db, who, profileId);
}
