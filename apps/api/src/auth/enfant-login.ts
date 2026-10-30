/**
 * V2-3 : comptes des enfants avec identifiant (sans e-mail ni nom de famille).
 *  - forme et disponibilité de l'identifiant, propositions « prénom-NNN » ;
 *  - session LIMITÉE à un profil (`session.profile_id`) : refus par défaut, seule une liste fermée de routes
 *    d'apprentissage passe, et toute référence à un AUTRE profil est refusée ;
 *  - le parent donne un nouveau mot de passe ou débloque son enfant (POST /profiles/:id/acces).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { canActForProfile, schema as t, type Db } from '@awform/db';
import { hashSecret } from './crypto.js';
import { checkPassword } from './passwords.js';
import { audit } from './service.js';
import { err, type AuthKit } from './common.js';

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
export function meEnfant(m: unknown, profileId: string): unknown {
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
  };
}

// ------------------------------------------------------------------ session limitée

const PUBLIC_READ =
  /^\/api\/v1\/(health|config|levels|units|packs|quran|booklets|hifz\/books|pays|public|contenu\/errata|contenu\/suspensions|acces\/statut)(\/|$)/;
/** apprentissage : routes sans profil dans l'adresse (le profil est contrôlé dans le corps ou la requête) */
const APPRENTISSAGE =
  /^\/api\/v1\/(attempts|progress|sync|today|activites|adhkar|coran-mots|lecons-audio|fonctions|mesure)(\/|$)/;
/** apprentissage sous /profiles/<son identifiant>/… (pas de réglages, responsables, accords, écoute, émancipation…) */
const SOUS_PROFIL =
  /^(accueil|parcours|carnet|carnet-perso|cas|conversation|espace|niveaux|niveau-suivant|positionnement|recapitulatif|sourates|regularite|mots-coran|ecriture|tajwid|reponses-libres|epreuve|epreuves)(\/|$)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** clés qui désignent un profil, à n'importe quelle profondeur d'un corps ou d'une requête */
function autreProfil(valeur: unknown, propre: string, profondeur = 0): boolean {
  if (profondeur > 8 || valeur === null || typeof valeur !== 'object') return false;
  for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) {
    if (/^(profile_?id|profil_?id|pid|profile)$/i.test(k) && typeof v === 'string' && v !== propre)
      return true;
    if (autreProfil(v, propre, profondeur + 1)) return true;
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
): boolean {
  const chemin = url.split('?')[0] ?? '';
  const m = method.toUpperCase();
  if (autreProfil(corps, profileId) || autreProfil(requete, profileId)) return false;
  if (chemin === '/api/v1/auth/me' && m === 'GET') return true;
  if (chemin === '/api/v1/auth/logout' && m === 'POST') return true;
  if ((m === 'GET' || m === 'HEAD') && PUBLIC_READ.test(chemin)) return true;
  if (APPRENTISSAGE.test(chemin)) return true;
  const sous = /^\/api\/v1\/profiles\/([^/]+)\/(.*)$/.exec(chemin);
  if (sous) return UUID.test(sous[1]!) && sous[1] === profileId && SOUS_PROFIL.test(sous[2]!);
  return false;
}

export function enregistrerSessionLimitee(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = req.auth?.profileId;
    if (!p) return;
    if (!autoriseEnfant(req.method, req.url, p, req.body, req.query))
      return err(reply, 403, 'session_limitee');
  });
}

// ------------------------------------------------------------------ routes du parent

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
    async (req) => {
      const login = (req.query.login ?? '').trim().toLowerCase();
      const forme = LOGIN_ENFANT.test(login);
      const libre = forme ? !(await loginPris(db, login)) : false;
      const candidats = propositions(req.query.prenom ?? login);
      const propositionsLibres: string[] = [];
      for (const c of candidats) if (!(await loginPris(db, c))) propositionsLibres.push(c);
      return { forme, disponible: libre, propositions: propositionsLibres };
    },
  );

  app.post<{ Params: { id: string }; Body: { motDePasse?: string; debloquer?: boolean } }>(
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
          },
        },
      },
    },
    async (req, reply) => {
      const parent = req.auth!.accountId;
      // le parent d'un AUTRE enfant n'apprend même pas que ce profil existe
      if (!(await canActForProfile(db, parent, req.params.id)))
        return err(reply, 404, 'introuvable');
      const [lg] = await db
        .select()
        .from(t.profileLogin)
        .where(eq(t.profileLogin.profileId, req.params.id));
      if (!lg) return err(reply, 404, 'introuvable');
      const [p] = await db
        .select({ pseudonym: t.profile.pseudonym })
        .from(t.profile)
        .where(eq(t.profile.id, req.params.id));
      const valeurs: { passwordHash?: string; passwordChangedAt: Date } = {
        passwordChangedAt: new Date(),
      };
      if (req.body.motDePasse) {
        const pb = checkPassword(req.body.motDePasse, '', {
          identifiants: [lg.login, p?.pseudonym ?? ''],
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
