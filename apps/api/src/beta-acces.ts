/**
 * Bêta : accès, invitations, liste d'attente, plafond d'inscriptions, vérification de l'adresse, anti-robots, tableau
 * de bord (API) :
 *  - PUBLIC : `GET /api/v1/acces/statut` (mode, inscription offerte, site, bandeau, vérification, anti-robots, plein ou
 *    non), `GET /api/v1/acces/jeton` (jeton anti-robots), `POST /api/v1/acces/invitation` (contrôle d'un code SANS le
 *    consommer), `POST /api/v1/acces/liste-attente` (demande d'invitation ; réponse toujours identique, limites anti-abus) ;
 *  - ADMINISTRATEUR (second facteur) : `PUT /api/v1/admin/acces` (mode : `ferme` | `invitation` | `ouvert`, plafond
 *    d'inscriptions, vérification de l'adresse, anti-robots, bandeau — effet en moins de 5 secondes, sans redéploiement),
 *    invitations (création, liste, révocation, envoi par e-mail), liste d'attente (accepter, refuser) et
 *    `GET /api/v1/admin/tableau` (comptes, plafond, coût estimé du jour, plafonds de consommation, alertes) ;
 *  - TROIS MODES : « fermé » (page de maintenance pour tous sauf les administrateurs), « sur invitation » (code requis),
 *    « ouvert » (inscription libre) TOUJOURS sous un plafond de comptes : plein, l'inscription libre passe seule en
 *    LISTE D'ATTENTE (une invitation reste valable). Retour arrière : le mode précédent se remet en une action ;
 *  - MODE FERMÉ : toute l'API répond 503 « acces_ferme » aux non-administrateurs (restent joignables : santé, statut,
 *    jeton, connexion/déconnexion, administration, webhooks de paiement) ;
 *  - VÉRIFICATION de l'adresse (réglage « requise », appliquée seulement si l'envoi d'e-mails est réglé) : tant que
 *    l'adresse n'est pas vérifiée, l'API répond 403 « email_non_verifie » (sauf compte, vérification, administration).
 * Le code d'une invitation n'est montré qu'à sa création (empreinte seule en base). Les journaux ne contiennent ni code
 * ni adresse.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  ATTENTE_GROUPE_MODES,
  groupeAcceptation,
  confirmerAttente,
  demanderAttente,
  desinscrireAttente,
  waitlistTokenHash,
  ajouterAuGroupeBeta,
  checkInvitation,
  GROUPES_INVITATION,
  listGroupeBeta,
  retirerDuGroupeBeta,
  countComptes,
  countWaitlist,
  createInvitation,
  decideWaitlist,
  deleteWaitlist,
  demanderAttenteTelephone,
  invitationAssistee,
  getWaitlist,
  inscriptionEffective,
  listInvitations,
  listWaitlist,
  modeDe,
  MODES_ACCES,
  normSource,
  originesDemandes,
  readAcces,
  reglagesDuMode,
  revokeInvitation,
  schema as t,
  setAcces,
  setAccesDefaut,
  WAITLIST_PER_HOUR_ALL,
  WAITLIST_STATUS,
  waitlistLastHour,
  type AccesStatut,
  type Db,
} from '@awform/db';
import { emettreJeton, verifierJeton } from './antibot.js';
import { EMAIL, INVITATION_TRIES_PER_HOUR } from './auth/common.js';
import { audit, hasRole, lockedUntil, recordFailure } from './auth/service.js';
import { err, UUID } from './guards.js';
import type { Mailer } from './mail/envoi.js';
import { renderMail } from './mail/modeles.js';
import { budgetTuteurIa, coutsDuJour, listePlafonds, tableauComptes } from './plafonds.js';
import { lienWhatsapp, masquerTelephone, normaliserTelephone } from '@awform/school/telephone';
import { dechiffrer, phoneHashOf, chiffrer } from './identites/cles.js';
import { consommerDefi, enAttenteManuelle, envoisDuJour, type CtxTel } from './identites/defis.js';
import { DEFI_SCHEMA } from './identites/routes-telephone.js';

/** Chemins de l'API qui restent joignables quand le site est fermé (le reste répond 503 aux non-administrateurs). */
const OUVERT_FERME = /^\/api\/v1\/(health|acces\/(statut|jeton)|auth\/|admin\/|billing\/webhook\/)/;
/**
 * Contenu des livres, du Coran et des rubriques : FERMÉ aux visiteurs non connectés quand la bêta est « sur invitation »
 * (les textes religieux sont encore en attente de relecture : pas d'accès anonyme).
 */
const CONTENU_FERME_AUX_ANONYMES =
  /^\/api\/v1\/(levels|units|packs|booklets|quran|hifz\/books|vivre|lecons-audio|adhkar)(\/|\?|$)/;
/** Chemins accessibles à un compte dont l'adresse n'est pas encore vérifiée. */
const OUVERT_NON_VERIFIE =
  /^\/api\/v1\/(health|acces\/|auth\/|account\/(email|telephone|codes-secours)|tel\/|admin\/|billing\/webhook\/|config|pays|public)/;

export function registerBetaAcces(
  app: FastifyInstance,
  db: Db,
  opts: {
    mailer: Mailer;
    publicUrl: string | null;
    secretKey?: Buffer | null;
    /** 18/10/2026 : numéro WhatsApp actif (liste d'attente et invitations par numéro) ; null : inactif */
    telephone?: CtxTel | null;
    /** 18/10/2026 : « Continuer avec Google » configuré */
    google?: boolean;
  },
): void {
  // défaut de l'environnement : AWFORM_ACCES = ouvert (défaut) | invitation | ferme ; AWFORM_BANDEAU = on | off ;
  // AWFORM_PLAFOND_COMPTES (défaut 200) ; AWFORM_VERIFICATION = souple | requise ; AWFORM_ANTIBOT = off | on
  setAccesDefaut({
    acces: process.env.AWFORM_ACCES,
    bandeau: process.env.AWFORM_BANDEAU,
    plafond: process.env.AWFORM_PLAFOND_COMPTES,
    verification: process.env.AWFORM_VERIFICATION,
    antibot: process.env.AWFORM_ANTIBOT,
    qfEnfants: process.env.AWFORM_QF_PROFILS_ENFANTS,
  });
  const courrielActif = opts.mailer.mode !== 'inactif';
  const tel = opts.telephone?.cfg.actif ? opts.telephone : null;
  /** message d'invitation à envoyer soi-même par WhatsApp (lien « wa.me » gratuit, ouvert par l'administrateur) */
  const lienWa = (e164: string, lien: string | null, locale: string) =>
    lien ? lienWhatsapp(e164, renderMail('invitation', locale, { link: lien }).text) : null;
  async function envoyerWhatsapp(e164: string, code: string, locale: string): Promise<boolean> {
    const link = lienDe(code);
    if (!link || !tel?.cfg.envoi) return false;
    try {
      await tel.expediteur.send({ to: e164, kind: 'invitation', link, locale });
      return true;
    } catch {
      app.log.warn('envoi WhatsApp de l’invitation en échec');
      return false;
    }
  }

  // ---------------------------------------------------------------- mode fermé et adresse non vérifiée
  const verifies = new Map<string, number>(); // comptes vérifiés (30 s de mémoire)
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/v1/')) return;
    const acces = await readAcces(db);
    if (acces.site === 'ferme' && !OUVERT_FERME.test(req.url) && !hasRole(req.auth, 'admin')) {
      void reply.header('Retry-After', '600');
      return err(reply, 503, 'acces_ferme');
    }
    // bêta « sur invitation » : le contenu n'est pas servi aux visiteurs anonymes (l'application leur montre l'accueil de la bêta)
    if (
      acces.site === 'ouvert' &&
      acces.inscription === 'invitation' &&
      !req.auth &&
      CONTENU_FERME_AUX_ANONYMES.test(req.url)
    )
      return err(reply, 401, 'connexion_requise');
    // vérification de l'adresse avant activation (familles et adultes seulement ; sans e-mail réglé, impossible)
    const a = req.auth;
    if (
      acces.verification === 'requise' &&
      courrielActif &&
      a &&
      (a.kind === 'parent' || a.kind === 'adulte') &&
      !hasRole(a, 'admin') &&
      !a.tablet &&
      !OUVERT_NON_VERIFIE.test(req.url)
    ) {
      const vu = verifies.get(a.accountId);
      if (vu && Date.now() - vu < 30_000) return;
      const [row] = await db
        .select({
          v: t.account.emailVerifiedAt,
          tel: t.account.phoneVerifiedAt,
          email: t.account.email,
        })
        .from(t.account)
        .where(eq(t.account.id, a.accountId));
      // 18/10/2026 : un compte ouvert par numéro (sans adresse) est vérifié par son numéro
      if (row?.v || (row && !row.email && row.tel)) {
        verifies.set(a.accountId, Date.now());
        return;
      }
      return err(reply, 403, 'email_non_verifie');
    }
  });

  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!hasRole(req.auth, 'admin')) return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  const lienDe = (code: string): string | null =>
    opts.publicUrl ? `${opts.publicUrl.replace(/\/+$/, '')}/inscription#code=${code}` : null;

  /** Envoie l'invitation par e-mail (dans la langue de la personne) ; true si le message est parti. */
  async function envoyer(to: string, code: string, locale: string): Promise<boolean> {
    const link = lienDe(code);
    if (!link || opts.mailer.mode === 'inactif') return false;
    try {
      await opts.mailer.send({
        to,
        kind: 'invitation',
        ...renderMail('invitation', locale, { link }),
      });
      return true;
    } catch (e) {
      app.log.warn({ type: (e as Error).name }, 'envoi invitation en échec');
      return false;
    }
  }

  /** E-mail de confirmation de la liste d'attente (lien dans le fragment : jamais dans les journaux) ; rien sans e-mail réglé. */
  async function envoyerConfirmationAttente(to: string, jeton: string, locale: string) {
    if (!opts.publicUrl || opts.mailer.mode === 'inactif') return;
    const base = opts.publicUrl.replace(/\/+$/, '');
    try {
      await opts.mailer.send({
        to,
        kind: 'liste_attente',
        ...renderMail('liste_attente', locale, {
          link: `${base}/bienvenue/confirmer?lang=${locale}#t=${jeton}`,
          unsub: `${base}/bienvenue/desinscription?lang=${locale}#t=${jeton}`,
        }),
      });
    } catch (e) {
      app.log.warn({ type: (e as Error).name }, 'envoi confirmation liste d’attente en échec');
    }
  }

  /** Vue publique de l'état d'accès (aucun nombre de comptes : seulement « plein » ou non). */
  async function statutPublic(acces: AccesStatut) {
    const comptes = acces.inscription === 'ouverte' ? await countComptes(db) : 0;
    const effective = inscriptionEffective(acces, comptes);
    return {
      mode: modeDe(acces),
      inscription: effective,
      site: acces.site,
      bandeau: acces.bandeau,
      verification: acces.verification === 'requise' && courrielActif ? 'requise' : 'souple',
      antibot: acces.antibot,
      // 18/10/2026 : façons d'entrer offertes (chacune derrière son interrupteur ; l'e-mail toujours)
      google: !!opts.google,
      telephone: !!tel,
      telephoneEnvoi: !!tel?.cfg.envoi,
      telephoneManuel: !!tel?.cfg.manuel,
    };
  }

  // ---------------------------------------------------------------- public

  app.get('/api/v1/acces/statut', async (req) => {
    const s = await statutPublic(await readAcces(db));
    return {
      ...s,
      // permet à l'application d'ouvrir les pages à l'administrateur connecté quand le site est fermé
      admin: hasRole(req.auth, 'admin'),
    };
  });

  app.get('/api/v1/acces/jeton', async (_req, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return { jeton: emettreJeton(opts.secretKey ?? null) };
  });

  app.post<{ Body: { code: string; email?: string } }>(
    '/api/v1/acces/invitation',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 40 },
            email: { type: 'string', maxLength: 254 },
          },
        },
      },
    },
    async (req, reply) => {
      const key = `invit:${req.ip}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'trop_de_demandes');
      const r = await checkInvitation(db, req.body.code, req.body.email ?? null);
      if (!r.ok) {
        await recordFailure(db, key, INVITATION_TRIES_PER_HOUR);
        return err(reply, 403, r.raison);
      }
      // inscription ASSISTÉE : type de compte, pays et numéro (masqué) préparés par l'administrateur
      const a = await invitationAssistee(db, req.body.code);
      return {
        valide: true,
        personnelle: r.personnelle,
        ...(a
          ? {
              assistee: {
                kind: a.kind,
                pays: a.country,
                numero: masquerTelephone(dechiffrer(opts.secretKey ?? null, a.phoneEnc)),
              },
            }
          : {}),
      };
    },
  );

  app.post<{
    Body: {
      email?: string;
      defi?: { id: string; jeton: string };
      nom?: string;
      mot?: string;
      langue?: string;
      consentement: boolean;
      jeton?: string;
      site_web?: string;
      src?: string;
    };
  }>(
    '/api/v1/acces/liste-attente',
    {
      schema: {
        body: {
          type: 'object',
          required: ['consentement'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254, pattern: EMAIL },
            // 18/10/2026 : OU un numéro WhatsApp vérifié (le message envoyé vaut double consentement)
            defi: DEFI_SCHEMA,
            nom: { type: 'string', maxLength: 80 },
            mot: { type: 'string', maxLength: 500 },
            langue: { type: 'string', maxLength: 10 },
            consentement: { type: 'boolean' },
            // anti-robots (réglage « antibot »), comme l'inscription : jeton signé émis à l'ouverture + champ piège caché
            jeton: { type: 'string', maxLength: 100 },
            site_web: { type: 'string', maxLength: 200 },
            // provenance (?src= des affiches) : gardée si elle est valide (^[a-z0-9-]{1,40}$), ignorée sinon
            src: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      // RGPD : l'adresse n'est gardée qu'avec l'accord de la personne, pour la seule gestion de la liste
      if (req.body.consentement !== true) return err(reply, 400, 'consentement_requis');
      // anti-robots sans service tiers : champ piège vide, jeton signé ni trop récent (3 s) ni trop ancien (2 h)
      if ((await readAcces(db)).antibot === 'on') {
        const verdict = req.body.site_web
          ? 'piege'
          : verifierJeton(opts.secretKey ?? null, req.body.jeton);
        if (verdict !== 'ok') return err(reply, 400, 'antibot_echec', { raison: verdict });
      }
      const key = `attente:${req.ip}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'trop_de_demandes');
      await recordFailure(db, key, 10); // au plus 10 demandes par heure et par adresse IP
      if ((await waitlistLastHour(db)) >= WAITLIST_PER_HOUR_ALL)
        return err(reply, 429, 'trop_de_demandes');
      const langue = ['fr', 'en', 'es', 'de', 'ar'].includes(req.body.langue ?? '')
        ? req.body.langue
        : 'fr';
      if (!!req.body.email === !!req.body.defi) return err(reply, 400, 'identifiant_requis');
      if (req.body.defi) {
        if (!tel) return err(reply, 404, 'telephone_inactif');
        const v = await consommerDefi(tel, req.body.defi, 'liste_attente');
        if (!v) return err(reply, 400, 'verification_invalide');
        await demanderAttenteTelephone(db, {
          phoneHash: v.phoneHash,
          phoneEnc: v.phoneEnc,
          phoneMask: masquerTelephone(v.e164) ?? '',
          name: req.body.nom,
          note: req.body.mot,
          locale: langue,
        });
        return reply.code(202).send({ ok: true });
      }
      const email = req.body.email!;
      // double consentement : la demande n'est « confirmée » (et visible de l'administrateur) qu'après le clic sur le lien
      // envoyé à l'adresse ; jeton aléatoire, seule son empreinte est gardée ; non confirmée, elle est effacée sous 7 jours
      const jeton = randomBytes(32).toString('base64url');
      const etat = await demanderAttente(db, {
        email,
        name: req.body.nom,
        note: req.body.mot,
        locale: langue,
        tokenHash: waitlistTokenHash(jeton),
        source: normSource(req.body.src),
      });
      if (etat !== 'existe')
        void envoyerConfirmationAttente(email.trim().toLowerCase(), jeton, langue ?? 'fr');
      // réponse identique que l'adresse soit nouvelle ou déjà dans la liste
      return reply.code(202).send({ ok: true });
    },
  );

  const BODY_JETON = {
    type: 'object',
    required: ['token'],
    additionalProperties: false,
    properties: { token: { type: 'string', minLength: 20, maxLength: 100 } },
  } as const;
  // confirmation (double consentement) et désinscription par les liens de l'e-mail ; essais limités par adresse IP
  app.post<{ Body: { token: string } }>(
    '/api/v1/acces/liste-attente/confirmer',
    { schema: { body: BODY_JETON } },
    async (req, reply) => {
      const key = `attconf:${req.ip}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'trop_de_demandes');
      const r = await confirmerAttente(db, req.body.token);
      if (r === 'invalide') {
        await recordFailure(db, key, 20);
        return err(reply, 400, 'lien_invalide');
      }
      return { etat: r };
    },
  );
  app.post<{ Body: { token: string } }>(
    '/api/v1/acces/liste-attente/desinscrire',
    { schema: { body: BODY_JETON } },
    async (req, reply) => {
      const key = `attconf:${req.ip}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'trop_de_demandes');
      if (!(await desinscrireAttente(db, req.body.token))) {
        await recordFailure(db, key, 20);
        return err(reply, 400, 'lien_invalide');
      }
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- administrateur

  app.get('/api/v1/admin/acces', { preHandler: needAdmin }, async () => {
    const [acces, invitations, attente] = await Promise.all([
      readAcces(db, { fresh: true }),
      listInvitations(db),
      countWaitlist(db),
    ]);
    return {
      acces: { ...acces, mode: modeDe(acces) },
      invitations,
      attente,
      courriel: opts.mailer.mode,
    };
  });

  app.put<{
    Body: {
      mode?: string;
      inscription?: string;
      site?: string;
      bandeau?: string;
      plafond?: number;
      verification?: string;
      antibot?: string;
      qf_profils_enfants?: string;
      attente_groupe?: string;
    };
  }>(
    '/api/v1/admin/acces',
    {
      preHandler: needAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            mode: { enum: [...MODES_ACCES] },
            inscription: { enum: ['ouverte', 'invitation'] },
            site: { enum: ['ouvert', 'ferme'] },
            bandeau: { enum: ['on', 'off'] },
            plafond: { type: 'integer', minimum: 0, maximum: 1_000_000 },
            verification: { enum: ['requise', 'souple'] },
            antibot: { enum: ['on', 'off'] },
            qf_profils_enfants: { enum: ['on', 'off'] },
            // lot 11 : groupe des invitations créées en acceptant la liste d'attente pendant la bêta
            attente_groupe: { enum: [...ATTENTE_GROUPE_MODES] },
          },
        },
      },
    },
    async (req) => {
      const { mode, ...autres } = req.body;
      const patch = {
        ...(mode ? reglagesDuMode(mode as (typeof MODES_ACCES)[number]) : {}),
        ...autres,
      } as Partial<AccesStatut>;
      await setAcces(db, patch, req.auth!.accountId);
      await audit(db, req.auth!.accountId, 'acces.reglage', null, req.body);
      const acces = await readAcces(db, { fresh: true });
      return { acces: { ...acces, mode: modeDe(acces) } };
    },
  );

  app.get('/api/v1/admin/tableau', { preHandler: needAdmin }, async () => {
    const acces = await readAcces(db, { fresh: true });
    const [comptes, couts, attente] = await Promise.all([
      tableauComptes(db),
      coutsDuJour(db),
      countWaitlist(db),
    ]);
    const invitations = (await listInvitations(db)).filter((i) => i.etat === 'active').length;
    const pct = acces.plafond > 0 ? Math.round((comptes.total / acces.plafond) * 100) : 100;
    const alertes: Array<{ code: string; niveau: 'info' | 'attention' | 'critique' }> = [];
    if (acces.site === 'ferme') alertes.push({ code: 'site_ferme', niveau: 'info' });
    if (acces.inscription === 'ouverte' && comptes.total >= acces.plafond)
      alertes.push({ code: 'plafond_atteint', niveau: 'attention' });
    else if (acces.inscription === 'ouverte' && pct >= 90)
      alertes.push({ code: 'plafond_proche', niveau: 'attention' });
    if ((attente.en_attente ?? 0) > 0) alertes.push({ code: 'attente', niveau: 'info' });
    if (comptes.nonVerifiesEnRetard >= 5)
      alertes.push({ code: 'verifications_en_retard', niveau: 'attention' });
    if (!courrielActif && (acces.verification === 'requise' || invitations > 0))
      alertes.push({ code: 'courriel_inactif', niveau: 'attention' });
    if (couts.estimeJourEur >= couts.seuilAlerteEur)
      alertes.push({ code: 'cout_jour_eleve', niveau: 'critique' });
    // 18/10/2026 : envois WhatsApp PAYANTS du jour (secours) sous leur plafond ; numéros à valider à la main
    const telephone = tel
      ? {
          envoisJour: await envoisDuJour(db),
          plafondJour: tel.cfg.plafondJour,
          envoi: tel.cfg.envoi,
          aValider: tel.cfg.manuel ? (await enAttenteManuelle(tel)).length : 0,
        }
      : null;
    if (telephone?.envoi && telephone.envoisJour >= telephone.plafondJour)
      alertes.push({ code: 'tel_plafond_atteint', niveau: 'critique' });
    else if (telephone?.envoi && telephone.envoisJour >= telephone.plafondJour * 0.8)
      alertes.push({ code: 'tel_plafond_proche', niveau: 'attention' });
    if ((telephone?.aValider ?? 0) > 0) alertes.push({ code: 'tel_a_valider', niveau: 'info' });
    // 19/10/2026 : tuteur de conversation — dépense, plafonds réglables, seuils franchis (50 / 80 / 100 %)
    const tuteurIa = await budgetTuteurIa(db);
    alertes.push(...tuteurIa.alertes);
    return {
      tuteurIa: tuteurIa.resume,
      telephone,
      mode: modeDe(acces),
      verification: acces.verification,
      antibot: acces.antibot,
      comptes: { ...comptes, plafond: acces.plafond, pourcentPlafond: pct },
      attente: { enAttente: attente.en_attente ?? 0, invitationsActives: invitations },
      couts,
      plafonds: [...listePlafonds(), tuteurIa.plafond],
      alertes,
      // « Origine des demandes » : agrégats par provenance (?src=), sans adresse
      origines: await originesDemandes(db),
    };
  });

  app.post<{
    Body: {
      libelle?: string;
      adresse?: string;
      max?: number;
      jours?: number;
      envoyer?: boolean;
      langue?: string;
      groupe?: (typeof GROUPES_INVITATION)[number];
      numero?: string;
      pays?: string;
      assistee?: 'parent' | 'adulte';
    };
  }>(
    '/api/v1/admin/invitations',
    {
      preHandler: needAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // 18/10/2026 : invitation personnelle par NUMÉRO (sans indicatif : lu dans « pays », défaut Sénégal)
            numero: { type: 'string', maxLength: 32 },
            pays: { type: 'string', pattern: '^[A-Z]{2}$' },
            // INSCRIPTION ASSISTÉE : l'administrateur prépare le compte (type ; pays ci-dessus), lien de 7 jours
            assistee: { enum: ['parent', 'adulte'] },
            // lot 6 : groupe attribué au compte qui s'inscrit avec cette invitation
            groupe: { enum: [...GROUPES_INVITATION] },
            libelle: { type: 'string', maxLength: 80 },
            adresse: { type: 'string', maxLength: 254, pattern: EMAIL },
            max: { type: 'integer', minimum: 1, maximum: 1000 },
            // 0 = sans expiration
            jours: { type: 'integer', minimum: 0, maximum: 365 },
            envoyer: { type: 'boolean' },
            langue: { type: 'string', maxLength: 10 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (b.adresse && b.numero) return err(reply, 400, 'identifiant_multiple');
      let e164: string | null = null;
      let paysNumero: string | null = null;
      if (b.numero) {
        if (!opts.secretKey) return err(reply, 503, 'telephone_inactif');
        const n = normaliserTelephone(b.numero, b.pays ?? 'SN');
        if (!n.ok) return err(reply, 400, `numero_${n.raison}`);
        e164 = n.e164;
        paysNumero = n.pays;
      }
      // une invitation personnelle (adresse ou numéro) ou assistée n'a qu'un usage
      const personnelle = !!b.adresse || !!e164;
      const max = personnelle || b.assistee ? 1 : (b.max ?? 1);
      const inv = await createInvitation(db, {
        label: b.libelle,
        email: b.adresse,
        maxUses: max,
        // inscription assistée : lien personnel de 7 jours (sauf durée choisie plus courte)
        days: b.assistee ? Math.min(b.jours || 7, 7) : b.jours,
        by: req.auth!.accountId,
        groupe: b.groupe ?? null,
        phoneHash: e164 ? phoneHashOf(opts.secretKey!, e164) : null,
        phoneMask: e164 ? masquerTelephone(e164) : null,
        phoneEnc: e164 && b.assistee ? chiffrer(opts.secretKey!, e164) : null,
        assistedKind: b.assistee ?? null,
        assistedCountry: b.assistee ? (b.pays ?? paysNumero) : null,
      });
      await audit(db, req.auth!.accountId, 'invitation.creation', inv.id, {
        max,
        personnelle,
        ...(e164 ? { numero: true } : {}),
        ...(b.assistee ? { assistee: b.assistee } : {}),
        ...(b.groupe ? { groupe: b.groupe } : {}),
      });
      const langue = b.langue ?? 'fr';
      const envoye =
        b.adresse && b.envoyer
          ? await envoyer(b.adresse, inv.code, langue)
          : e164 && b.envoyer
            ? await envoyerWhatsapp(e164, inv.code, langue)
            : false;
      return reply.code(201).send({
        id: inv.id,
        code: inv.code,
        lien: lienDe(inv.code),
        expireLe: inv.expiresAt,
        envoye,
        // gratuit : l'administrateur ouvre WhatsApp sur la conversation de la personne, message pré-rempli
        ...(e164 ? { lienWhatsapp: lienWa(e164, lienDe(inv.code), langue) } : {}),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/admin/invitations/:id/revoquer',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      if (!(await revokeInvitation(db, req.params.id))) return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'invitation.revocation', req.params.id);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- groupe « bêta fermée » (lot 6)
  // Les membres voient le contenu différé de Madjaliss (interrupteur `beta_contenu_differe_visible`). Ajout par adresse,
  // retrait par identifiant (droit perdu aussitôt), chaque changement est journalisé. Administrateur, second facteur.
  app.get('/api/v1/admin/groupe-beta', { preHandler: needAdmin }, async () => ({
    membres: await listGroupeBeta(db),
  }));

  app.post<{ Body: { adresse: string } }>(
    '/api/v1/admin/groupe-beta',
    {
      preHandler: needAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['adresse'],
          properties: { adresse: { type: 'string', maxLength: 254, pattern: EMAIL } },
        },
      },
    },
    async (req, reply) => {
      const r = await ajouterAuGroupeBeta(db, req.body.adresse, req.auth!.accountId);
      if (!r) return err(reply, 404, 'compte_inconnu');
      if (!r.dejaMembre) await audit(db, req.auth!.accountId, 'groupe_beta.ajout', r.id);
      return reply.code(r.dejaMembre ? 200 : 201).send({ id: r.id, dejaMembre: r.dejaMembre });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/admin/groupe-beta/:id',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      if (!(await retirerDuGroupeBeta(db, req.params.id))) return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'groupe_beta.retrait', req.params.id);
      return { ok: true };
    },
  );

  app.get<{ Querystring: { statut?: string } }>(
    '/api/v1/admin/liste-attente',
    {
      preHandler: needAdmin,
      schema: {
        querystring: {
          type: 'object',
          properties: { statut: { enum: [...WAITLIST_STATUS] } },
          additionalProperties: false,
        },
      },
    },
    async (req) => ({ demandes: await listWaitlist(db, req.query.statut ?? null) }),
  );

  app.post<{ Params: { id: string }; Body: { jours?: number } }>(
    '/api/v1/admin/liste-attente/:id/accepter',
    {
      preHandler: needAdmin,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { jours: { type: 'integer', minimum: 0, maximum: 365 } },
        },
      },
    },
    async (req, reply) => {
      const w = await getWaitlist(db, req.params.id);
      if (!w) return err(reply, 404, 'introuvable');
      if (w.status !== 'en_attente') return err(reply, 409, 'deja_traitee');
      // lot 11 : pendant la bêta (inscription sur invitation), la personne acceptée entre dans le groupe « bêta fermée »
      const groupe = groupeAcceptation(await readAcces(db, { fresh: true }));
      const inv = await createInvitation(db, {
        label: w.name ?? 'liste d’attente',
        email: w.email,
        maxUses: 1,
        days: req.body?.jours ?? 30,
        by: req.auth!.accountId,
        waitlistId: w.id,
        groupe,
        // 18/10/2026 : demande par numéro → invitation personnelle par ce numéro
        phoneHash: w.phoneHash,
        phoneMask: w.phoneMask,
      });
      if (!(await decideWaitlist(db, w.id, 'acceptee', req.auth!.accountId, inv.id)))
        return err(reply, 409, 'deja_traitee');
      await audit(
        db,
        req.auth!.accountId,
        'attente.acceptation',
        w.id,
        groupe ? { groupe } : undefined,
      );
      const e164 = dechiffrer(opts.secretKey ?? null, w.phoneEnc);
      const envoye = w.email
        ? await envoyer(w.email, inv.code, w.locale)
        : e164
          ? await envoyerWhatsapp(e164, inv.code, w.locale)
          : false;
      return {
        id: inv.id,
        code: inv.code,
        lien: lienDe(inv.code),
        expireLe: inv.expiresAt,
        envoye,
        ...(e164 ? { lienWhatsapp: lienWa(e164, lienDe(inv.code), w.locale) } : {}),
      };
    },
  );

  // désinscription / droit à l'effacement : la demande écrite à contact@ est exécutée ici (journal d'audit sans adresse)
  app.delete<{ Params: { id: string } }>(
    '/api/v1/admin/liste-attente/:id',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      if (!(await deleteWaitlist(db, req.params.id))) return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'attente.effacement', req.params.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/admin/liste-attente/:id/refuser',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      if (!(await decideWaitlist(db, req.params.id, 'refusee', req.auth!.accountId, null)))
        return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'attente.refus', req.params.id);
      return { ok: true };
    },
  );
}
