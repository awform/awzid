/**
 * V2-3 : comptes des enfants avec identifiant (sans e-mail ni nom de famille).
 *  - forme et disponibilité de l'identifiant, propositions « prénom-NNN » ;
 *  - session LIMITÉE à un profil (`session.profile_id`) : refus par défaut, seule une liste fermée de routes
 *    d'apprentissage passe, et toute référence à un AUTRE profil est refusée ;
 *  - le parent donne un nouveau mot de passe ou débloque son enfant (POST /profiles/:id/acces).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { canActForProfile, schema as t, type Db } from '@awform/db';
import { hashSecret } from './crypto.js';
import { checkPassword } from './passwords.js';
import { audit, reserveAttempt } from './service.js';
import { err, type AuthKit } from './common.js';
import { parentGate } from '../guards.js';

/** 3 à 24 caractères [a-z0-9-], au moins une lettre (jamais confondu avec un numéro), ni tiret au début ni à la fin. */
export const LOGIN_ENFANT = /^(?!-)(?!.*-$)(?=.*[a-z])[a-z0-9-]{3,24}$/;
export const estIdentifiantEnfant = (saisie: string) =>
  LOGIN_ENFANT.test(saisie.trim().toLowerCase());

/** « prénom » → base sûre (sans accents ni signes), au plus 20 caractères */
export function baseIdentifiant(prenom: string): string {
  const b = (prenom ?? '')
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/ç/g, 'c')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/ñ/g, 'n')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/g, '');
  return /[a-z]/.test(b) ? b : 'enfant';
}

/** trois propositions « prénom-NNN » (NNN à 3 chiffres) */
export function propositions(prenom: string, tirage: () => number = Math.random): string[] {
  const base = baseIdentifiant(prenom);
  const out = new Set<string>();
  while (out.size < 3) out.add(`${base}-${String(100 + Math.floor(tirage() * 900))}`);
  return [...out];
}

/** profil d'enfant ou d'ado (âge), accord parental « tuteur_ia » : lus à chaque requête de la session limitée */
export interface CtxEnfant {
  ado: boolean;
  tuteurIa: boolean;
}
export async function ctxEnfant(db: Db, profileId: string): Promise<CtxEnfant> {
  const [p] = await db
    .select({ kind: t.profile.kind })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  const [c] = await db
    .select({ id: t.consent.id })
    .from(t.consent)
    .where(
      and(
        eq(t.consent.profileId, profileId),
        eq(t.consent.type, 'tuteur_ia'),
        isNull(t.consent.withdrawnAt),
      ),
    )
    .limit(1);
  return { ado: p?.kind === 'ado', tuteurIa: !!c };
}

export async function loginPris(db: Db, login: string): Promise<boolean> {
  const [x] = await db
    .select({ p: t.profileLogin.profileId })
    .from(t.profileLogin)
    .where(eq(t.profileLogin.login, login));
  return !!x;
}

export async function chercherEnfant(db: Db, login: string) {
  const [x] = await db
    .select({
      profileId: t.profileLogin.profileId,
      passwordHash: t.profileLogin.passwordHash,
      passwordChangedAt: t.profileLogin.passwordChangedAt,
      ownerAccountId: t.profile.ownerAccountId,
    })
    .from(t.profileLogin)
    .innerJoin(t.profile, eq(t.profile.id, t.profileLogin.profileId))
    .where(eq(t.profileLogin.login, login));
  return x ?? null;
}

/**
 * Réponse de /auth/me pour la session d'un enfant : SON profil seulement, rien du compte du parent (adresse, numéro,
 * écoles, accords, rôles).
 */
export function meEnfant(m: unknown, profileId: string, ctx?: CtxEnfant): unknown {
  const r = (m ?? {}) as { profiles?: Array<{ id: string }>; account?: Record<string, unknown> };
  const a = r.account ?? {};
  return {
    profiles: (r.profiles ?? []).filter((p) => p.id === profileId),
    account: {
      id: a.id,
      kind: 'parent',
      email: null,
      telephone: null,
      country: a.country ?? null,
      locale: a.locale ?? 'fr',
      totpEnabled: false,
      hasPin: false,
      createdAt: a.createdAt,
      emailVerified: true,
    },
    roles: [],
    ecoles: [],
    enfantSession: true,
    ...(ctx ? { enfantAdo: ctx.ado, enfantTuteurIa: ctx.tuteurIa } : {}),
  };
}

// ------------------------------------------------------------------ session limitée

const PUBLIC_READ =
  /^\/api\/v1\/(health|config|levels|units|packs|quran|booklets|hifz\/books|pays|public|contenu\/errata|contenu\/suspensions|acces\/statut)(\/|$)/;
/** apprentissage : routes SANS identifiant de profil dans l'adresse (le profil, s'il est cité, l'est dans le corps ou la requête : contrôlé) */
const APPRENTISSAGE =
  /^\/api\/v1\/(attempts|progress|sync|activites|adhkar|coran-mots|lecons-audio|fonctions|mesure|usage)(\/|$)/;
/** correction d'un bilan par le serveur (aucun profil en jeu) */
const CORRECTION = /^\/api\/v1\/units\/[a-z]{2,3}\d{1,2}\.l\d{2}\/corriger$/;
/** lectures dont l'identifiant du profil est dans l'adresse : seulement le SIEN */
const LECTURE_PAR_PROFIL =
  /^\/api\/v1\/(today|dashboard)\/([^/]+)$|^\/api\/v1\/hifz\/profiles\/([^/]+)(\/marques)?$/;
/**
 * apprentissage sous /profiles/<son identifiant>/…, toutes méthodes. Les DÉCISIONS de niveau du parent
 * (`choisir-niveau`, `niveau-suivant`) n'y sont pas : sans code parent, la garde du serveur les laisserait passer.
 */
const SOUS_PROFIL =
  /^(accueil|parcours|carnet|carnet-perso|cas|conversation|espace|recapitulatif|sourates|regularite|mots-coran|ecriture|reponses-libres|epreuve|epreuves|commencer|quran\/reciter)(\/|$)/;
/**
 * sous /profiles/<son identifiant>/…, LECTURE seulement (contenus et réglages que l'enfant ne modifie pas).
 * Revue : `niveaux` (PUT = décision « parent »), `positionnement` (peut relever le niveau) et `tajwid` (le tajwīd
 * madd est réservé aux adultes) ne sont plus à l'écriture (le positionnement reste lisible : les pages /lectures, /revisions, /sciences le lisent).
 */
const SOUS_PROFIL_LECTURE =
  /^(niveaux|tajwid|positionnement|madjaliss|vivre|devoirs|certificats|hifz-classe|mode-evaluation|protections|quran\/allowed-reciters|quran\/reciters|quran\/suras\/[^/]+\/tracks)(\/|$)/;
/** motifs de signalement offerts à l'enfant et à l'ado : prédéfinis, jamais de texte libre */
export const MOTIFS_ENFANT = ['texte_arabe', 'orthographe', 'audio_absent', 'audio_faux', 'autre'];
/** seuls champs acceptés d'un signalement en session limitée (revue M1 : ni `ref`, ni `comment`, ni `excerpt`, ni autre) */
const CHAMPS_SIGNALEMENT_ENFANT = ['targetKind', 'unitId', 'path', 'fp', 'reason', 'edition'];
export function signalementEnfantOk(corps: unknown): boolean {
  if (!parcourable(corps) || Array.isArray(corps)) return false;
  const b = corps as { reason?: unknown };
  if (Object.keys(corps).some((k) => !CHAMPS_SIGNALEMENT_ENFANT.includes(k))) return false;
  return typeof b.reason === 'string' && MOTIFS_ENFANT.includes(b.reason);
}
const TUTEUR = /^\/api\/v1\/(tuteur-ia|tutor)(\/|$)/;
const TUTEUR_OK =
  /^\/api\/v1\/tuteur-ia\/[^/]+\/(etat|guidee|libre|prononciation\/[^/]+|scenario\/[^/]+)$|^\/api\/v1\/tutor\/[^/]+\/(ask|questions)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** plafonds du parcours d'un corps (revue B1 : un corps Buffer de plusieurs Mo ne doit pas coûter de temps) */
const CLES_MAX = 200;
const PROFONDEUR_MAX = 5;
/** seuls les objets simples et les tableaux sont parcourus : jamais un Buffer, un Uint8Array, un flux, une Map… */
function parcourable(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** clés qui désignent un profil, jusqu'à 5 niveaux de profondeur et 200 clés visitées d'un corps ou d'une requête */
function autreProfil(
  valeur: unknown,
  propre: string,
  profondeur = 0,
  vues: { n: number } = { n: 0 },
): boolean {
  if (profondeur > PROFONDEUR_MAX || !parcourable(valeur)) return false;
  // `for…in` s'arrête dès le plafond (Object.entries construirait d'abord toute la liste)
  for (const k in valeur) {
    if (++vues.n > CLES_MAX) return false;
    if (!Object.prototype.hasOwnProperty.call(valeur, k)) continue;
    const v = valeur[k];
    if (
      /^(profile_?id|profil_?id|pid|profil|profile)$/i.test(k) &&
      typeof v === 'string' &&
      v !== propre
    )
      return true;
    if (autreProfil(v, propre, profondeur + 1, vues)) return true;
  }
  return false;
}

/**
 * Cette requête est-elle permise à la session d'un enfant ? Liste fermée ; le reste est refusé.
 * Pure (testée route par route).
 */
export function autoriseEnfant(
  method: string,
  url: string,
  profileId: string,
  corps?: unknown,
  requete?: unknown,
  ctx: CtxEnfant = { ado: false, tuteurIa: false },
): boolean {
  const chemin = url.split('?')[0] ?? '';
  const m = method.toUpperCase();
  if (autreProfil(corps, profileId) || autreProfil(requete, profileId)) return false;
  if (chemin === '/api/v1/auth/me' && m === 'GET') return true;
  if (chemin === '/api/v1/auth/logout' && m === 'POST') return true;
  if ((m === 'GET' || m === 'HEAD') && PUBLIC_READ.test(chemin)) return true;
  if (APPRENTISSAGE.test(chemin)) return true;
  if (CORRECTION.test(chemin)) return m === 'POST';
  if (chemin === '/api/v1/contenu/signalements') return m === 'POST' && signalementEnfantOk(corps);
  // tuteur IA : l'ado seulement, et seulement avec l'accord parental « tuteur_ia » sur SON profil
  if (TUTEUR.test(chemin)) {
    if (!ctx.ado || !ctx.tuteurIa) return false;
    const x = /^\/api\/v1\/(?:tuteur-ia|tutor)\/([^/]+)\//.exec(chemin);
    return chemin === '/api/v1/tutor/status'
      ? m === 'GET'
      : x?.[1] === profileId && TUTEUR_OK.test(chemin);
  }
  const lp = LECTURE_PAR_PROFIL.exec(chemin);
  if (lp) return (m === 'GET' || m === 'HEAD') && (lp[2] ?? lp[3]) === profileId;
  const sous = /^\/api\/v1\/profiles\/([^/]+)\/(.*)$/.exec(chemin);
  if (sous) {
    if (!UUID.test(sous[1]!) || sous[1] !== profileId) return false;
    if (SOUS_PROFIL.test(sous[2]!)) return true;
    return (m === 'GET' || m === 'HEAD') && SOUS_PROFIL_LECTURE.test(sous[2]!);
  }
  return false;
}

export function enregistrerSessionLimitee(app: FastifyInstance, db: Db): void {
  // avant la validation : le refus de la session limitée passe avant toute erreur de schéma
  app.addHook('preValidation', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = req.auth?.profileId;
    if (!p) return;
    const ctx = TUTEUR.test(req.url.split('?')[0] ?? '')
      ? await ctxEnfant(db, p)
      : { ado: false, tuteurIa: false };
    if (!autoriseEnfant(req.method, req.url, p, req.body, req.query, ctx))
      return err(reply, 403, 'session_limitee');
  });
}

// ------------------------------------------------------------------ routes du parent

/**
 * Revue I3b : créer un identifiant d'enfant, donner un nouveau mot de passe ou débloquer exige la RESSAISIE DU MOT DE
 * PASSE DU PARENT (même contrôle, mêmes essais réservés que les autres actions sensibles du compte). Si le parent a
 * un code parent et l'envoie (`x-parent-pin`), il remplace le mot de passe, comme dans `parentGate`.
 * Renvoie false si le refus a été envoyé.
 */
export async function ressaisieParent(
  kit: AuthKit,
  req: FastifyRequest,
  reply: FastifyReply,
  motDePasse: string | undefined,
): Promise<boolean> {
  const { db, passwordOk } = kit;
  const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
  if (!a) {
    void err(reply, 401, 'mot_de_passe_incorrect');
    return false;
  }
  if (a.parentPinHash && req.headers['x-parent-pin']) return parentGate(db, req, reply, 'enfant');
  if (!motDePasse) {
    void err(reply, 400, 'mot_de_passe_requis');
    return false;
  }
  return passwordOk(reply, a, motDePasse);
}

/** disponibilité d'un identifiant : 20 demandes par heure et par compte (revue I2 : pas d'énumération) */
export const DISPONIBILITE_PAR_HEURE = 20;

export function registerEnfantLogin(app: FastifyInstance, kit: AuthKit): void {
  const { db, needParent } = kit;

  app.get<{ Querystring: { login?: string; prenom?: string } }>(
    '/api/v1/profiles/login-disponible',
    {
      preHandler: needParent,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            login: { type: 'string', maxLength: 40 },
            prenom: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const parent = req.auth!.accountId;
      // limite stricte par compte (réservation atomique ; au-delà, pause d'une heure) et trace dans le journal
      if (!(await reserveAttempt(db, `ld:${parent}`, DISPONIBILITE_PAR_HEURE, 60))) {
        await audit(db, parent, 'profil.login_disponible_limite');
        return err(reply, 429, 'trop_de_demandes');
      }
      await audit(db, parent, 'profil.login_disponible');
      const login = (req.query.login ?? '').trim().toLowerCase();
      const forme = LOGIN_ENFANT.test(login);
      const libre = forme ? !(await loginPris(db, login)) : false;
      const candidats = propositions(req.query.prenom ?? login);
      const propositionsLibres: string[] = [];
      for (const c of candidats) if (!(await loginPris(db, c))) propositionsLibres.push(c);
      return { forme, disponible: libre, propositions: propositionsLibres };
    },
  );

  /** l'identifiant d'un enfant (ou null) : pour la fiche du parent */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/acces',
    {
      preHandler: needParent,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      if (!(await canActForProfile(db, req.auth!.accountId, req.params.id)))
        return err(reply, 404, 'introuvable');
      const [lg] = await db
        .select({ login: t.profileLogin.login })
        .from(t.profileLogin)
        .where(eq(t.profileLogin.profileId, req.params.id));
      return { identifiant: lg?.login ?? null };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      motDePasse?: string;
      debloquer?: boolean;
      identifiant?: string;
      declaration?: boolean;
      password?: string;
    };
  }>(
    '/api/v1/profiles/:id/acces',
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
          properties: {
            motDePasse: { type: 'string', maxLength: 512 },
            debloquer: { type: 'boolean' },
            // profil existant sans identifiant : le parent lui en crée un (mêmes règles qu'à la création du profil)
            identifiant: { type: 'string', maxLength: 40 },
            declaration: { type: 'boolean' },
            // mot de passe DU PARENT (ressaisie, revue I3b)
            password: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
    async (req, reply) => {
      const parent = req.auth!.accountId;
      // le parent d'un AUTRE enfant n'apprend même pas que ce profil existe
      if (!(await canActForProfile(db, parent, req.params.id)))
        return err(reply, 404, 'introuvable');
      if (!(await ressaisieParent(kit, req, reply, req.body.password))) return reply;
      const [lg] = await db
        .select()
        .from(t.profileLogin)
        .where(eq(t.profileLogin.profileId, req.params.id));
      const [p] = await db
        .select({ pseudonym: t.profile.pseudonym, kind: t.profile.kind })
        .from(t.profile)
        .where(eq(t.profile.id, req.params.id));
      if (!p) return err(reply, 404, 'introuvable');
      if (!lg) {
        // création de l'identifiant d'un profil d'enfant EXISTANT (jamais d'un profil d'adulte)
        const login = req.body.identifiant?.trim().toLowerCase();
        if (!login) return err(reply, 404, 'introuvable');
        if (p.kind === 'adulte') return err(reply, 400, 'profil_adulte');
        if (!req.body.declaration) return err(reply, 400, 'declaration_requise');
        if (!LOGIN_ENFANT.test(login)) return err(reply, 400, 'identifiant_invalide');
        if (!req.body.motDePasse) return err(reply, 400, 'mot_de_passe_requis');
        const pb = checkPassword(req.body.motDePasse, '', { identifiants: [login, p.pseudonym] });
        if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
        if (await loginPris(db, login)) return err(reply, 409, 'identifiant_indisponible');
        try {
          await db.insert(t.profileLogin).values({
            profileId: req.params.id,
            login,
            passwordHash: await hashSecret(req.body.motDePasse),
            createdByAccountId: parent,
          });
        } catch {
          return err(reply, 409, 'identifiant_indisponible');
        }
        await audit(db, parent, 'profil.acces_cree', req.params.id);
        return reply.code(201).send({ ok: true, identifiant: login });
      }
      if (req.body.identifiant) return err(reply, 400, 'identifiant_existant');
      const valeurs: { passwordHash?: string; passwordChangedAt: Date } = {
        passwordChangedAt: new Date(),
      };
      if (req.body.motDePasse) {
        const pb = checkPassword(req.body.motDePasse, '', {
          identifiants: [lg.login, p.pseudonym],
        });
        if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
        valeurs.passwordHash = await hashSecret(req.body.motDePasse);
      } else if (!req.body.debloquer) return err(reply, 400, 'requete_invalide');
      await db
        .update(t.profileLogin)
        .set(valeurs)
        .where(eq(t.profileLogin.profileId, lg.profileId));
      // sessions ouvertes de l'enfant fermées (nouveau mot de passe) ; un simple déblocage les laisse
      if (valeurs.passwordHash)
        await db
          .update(t.session)
          .set({ revokedAt: new Date() })
          .where(eq(t.session.profileId, lg.profileId));
      await audit(
        db,
        parent,
        valeurs.passwordHash ? 'profil.acces_mdp' : 'profil.acces_debloque',
        lg.profileId,
      );
      return { ok: true };
    },
  );
}
