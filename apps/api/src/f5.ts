/**
 * Lot F5 « penser large » (API) :
 *  - INTERRUPTEURS DE FONCTIONS : `GET /api/v1/fonctions` (décision pour la personne connectée et son profil
 *    actif) ; écran de l'administrateur (`/api/v1/admin/fonctions…`) : état de base on / off / bêta, exceptions
 *    par rôle, âge, pays, école ou canal ; effet en moins d'une minute (cache de 30 s), sans redéploiement.
 *    `exigeFonction` REFUSE côté serveur une fonction coupée (« fonction_coupee »), l'application la masque.
 *  - CANAL BÊTA : comptes et écoles marqués par l'administrateur (`PUT /api/v1/admin/beta`).
 *  - « DONNER MON AVIS » : `POST /api/v1/avis` (catégorie, texte court — jamais pour un enfant —, capture
 *    facultative), limites anti-abus, file de l'administrateur avec statut.
 *  - USAGE SANS TRACEUR : `POST /api/v1/usage` (clés d'une liste fermée, une fois par jour et par appareil),
 *    agrégats par jour seulement ; tableau `GET /api/v1/admin/usage` avec seuil d'anonymat (≥ 10).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  addFlagRule,
  deleteFlagRule,
  FEEDBACK_CAPTURE_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PER_DAY,
  FEEDBACK_PER_HOUR_ALL,
  FEEDBACK_STATUS,
  feedbackCapture,
  feedbackRecent,
  flagContext,
  insertFeedback,
  lessonStats,
  listBeta,
  listFeedback,
  readFlags,
  recordUsage,
  schema as t,
  setBeta,
  setFeedbackStatus,
  setFlagState,
  usageReport,
  type Db,
  type FlagContext,
} from '@awform/db';
import {
  AGES_FONCTION,
  ETATS_FONCTION,
  FONCTION_CLES,
  FONCTIONS,
  fonctionsPour,
  ROLES_FONCTION,
  SEUIL_ANONYMAT,
  USAGE_CLES,
  type FonctionCle,
} from '@awform/school';
import { ownsProfile } from './auth/routes.js';
import { audit, hasRole } from './auth/service.js';
import { err, UUID } from './guards.js';

/** Profil actif proposé par l'appareil, retenu seulement s'il appartient à la personne connectée. */
async function profilDe(db: Db, req: FastifyRequest, id: unknown): Promise<string | null> {
  if (!req.auth || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await ownsProfile(db, req.auth, id)) ? id : null;
}

export async function contexteDe(
  db: Db,
  req: FastifyRequest,
  profileId: string | null,
): Promise<FlagContext> {
  return flagContext(db, {
    accountId: req.auth?.accountId ?? null,
    accountKind: req.auth?.kind ?? null,
    roles: req.auth?.roles ?? [],
    country: req.auth?.country ?? null,
    profileId,
  });
}

export async function fonctionsDe(
  db: Db,
  req: FastifyRequest,
  profileId: string | null,
): Promise<{ fonctions: Record<FonctionCle, boolean>; canal: FlagContext['canal'] }> {
  const ctx = await contexteDe(db, req, profileId);
  const f = await readFlags(db);
  return { fonctions: fonctionsPour(ctx, f.etats, f.regles), canal: ctx.canal };
}

/**
 * Garde serveur : refuse (403 « fonction_coupee ») une fonction coupée pour cette personne. `profileId` : profil
 * concerné par la requête (déjà contrôlé par l'appelant), sinon le profil proposé par l'en-tête `x-profil`.
 * Renvoie false si le refus a été envoyé.
 */
export async function exigeFonction(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  cle: FonctionCle,
  profileId?: string | null,
): Promise<boolean> {
  const pid =
    profileId === undefined ? await profilDe(db, req, req.headers['x-profil']) : profileId;
  const { fonctions } = await fonctionsDe(db, req, pid);
  if (fonctions[cle]) return true;
  void err(reply, 403, 'fonction_coupee', { fonction: cle });
  return false;
}

/** Rôle d'une personne pour les agrégats d'usage et les avis (un seul, le plus parlant). */
function roleDe(ctx: FlagContext, profileId: string | null): string {
  if (profileId) return 'eleve';
  for (const r of ['admin', 'direction', 'enseignant', 'parent', 'eleve'])
    if (ctx.roles.includes(r)) return r;
  return 'visiteur';
}

const IMG = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const MAGIC: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

export function registerF5(app: FastifyInstance, db: Db, version: string): void {
  /** administrateur (écritures) ou support (lecture), second facteur vérifié */
  const staff =
    (...roles: string[]) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!hasRole(req.auth, ...roles)) return err(reply, 403, 'reserve_admin');
      if (!req.auth.mfaVerified)
        return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
    };
  const needAdmin = staff('admin');
  const needSupport = staff('admin', 'support');

  // ---------------------------------------------------------------- décision pour la personne

  app.get<{ Querystring: { profil?: string } }>(
    '/api/v1/fonctions',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { profil: UUID },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const pid = await profilDe(db, req, req.query.profil);
      const r = await fonctionsDe(db, req, pid);
      // copie courte : l'appareil redemande au plus toutes les 5 minutes (et garde la dernière pour le hors ligne)
      reply.header('Cache-Control', 'private, no-cache');
      return { ...r, ttl: 300 };
    },
  );

  // ---------------------------------------------------------------- administration des interrupteurs

  const ecolesListe = () =>
    db
      .select({ id: t.school.id, nom: t.school.name, personnelle: t.school.personal })
      .from(t.school)
      .where(eq(t.school.status, 'active'))
      .orderBy(t.school.name)
      .limit(500);

  app.get('/api/v1/admin/fonctions', { preHandler: needSupport }, async () => {
    const f = await readFlags(db, 0);
    const beta = await listBeta(db);
    const betaIds = new Set(beta.ecoles.map((e) => e.id));
    return {
      fonctions: FONCTION_CLES.map((cle) => ({
        cle,
        defaut: FONCTIONS[cle].defaut,
        etat: f.etats[cle] ?? null,
        regles: f.regles.filter((r) => r.cle === cle),
      })),
      roles: ROLES_FONCTION,
      ages: AGES_FONCTION,
      ecoles: (await ecolesListe()).map((e) => ({ ...e, beta: betaIds.has(e.id) })),
      beta,
    };
  });

  app.put<{ Params: { cle: string }; Body: { etat: 'on' | 'off' | 'beta' } }>(
    '/api/v1/admin/fonctions/:cle',
    {
      preHandler: needAdmin,
      schema: {
        params: {
          type: 'object',
          properties: { cle: { type: 'string', enum: [...FONCTION_CLES] } },
          required: ['cle'],
        },
        body: {
          type: 'object',
          properties: { etat: { type: 'string', enum: [...ETATS_FONCTION] } },
          required: ['etat'],
          additionalProperties: false,
        },
      },
    },
    async (req) => {
      await setFlagState(db, req.params.cle, req.body.etat, req.auth!.accountId);
      await audit(db, req.auth!.accountId, 'fonction.etat', req.params.cle, {
        etat: req.body.etat,
      });
      return { ok: true };
    },
  );

  app.post<{
    Params: { cle: string };
    Body: {
      effet: 'on' | 'off';
      role?: string;
      age?: string;
      pays?: string;
      ecoleId?: string;
      canal?: 'beta' | 'production';
    };
  }>(
    '/api/v1/admin/fonctions/:cle/regles',
    {
      preHandler: needAdmin,
      schema: {
        params: {
          type: 'object',
          properties: { cle: { type: 'string', enum: [...FONCTION_CLES] } },
          required: ['cle'],
        },
        body: {
          type: 'object',
          properties: {
            effet: { type: 'string', enum: ['on', 'off'] },
            role: { type: 'string', enum: ['', ...ROLES_FONCTION] },
            age: { type: 'string', enum: ['', ...AGES_FONCTION] },
            pays: { type: 'string', pattern: '^([A-Za-z]{2})?$' },
            ecoleId: { anyOf: [UUID, { type: 'string', maxLength: 0 }] },
            canal: { type: 'string', enum: ['', 'beta', 'production'] },
          },
          required: ['effet'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (!b.role && !b.age && !b.pays && !b.ecoleId && !b.canal)
        return err(reply, 400, 'regle_sans_critere');
      const id = await addFlagRule(
        db,
        {
          cle: req.params.cle,
          effet: b.effet,
          role: b.role || null,
          age: b.age || null,
          pays: b.pays || null,
          ecoleId: b.ecoleId || null,
          canal: b.canal || null,
        },
        req.auth!.accountId,
      );
      await audit(db, req.auth!.accountId, 'fonction.regle_ajout', req.params.cle, { id, ...b });
      return reply.code(201).send({ id });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/admin/fonctions/regles/:id',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } },
    },
    async (req, reply) => {
      if (!(await deleteFlagRule(db, req.params.id))) return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'fonction.regle_retrait', req.params.id);
      return { ok: true };
    },
  );

  app.put<{
    Body: { type: 'compte' | 'ecole'; id?: string; email?: string; beta: boolean };
  }>(
    '/api/v1/admin/beta',
    {
      preHandler: needAdmin,
      schema: {
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['compte', 'ecole'] },
            id: UUID,
            email: { type: 'string', maxLength: 254 },
            beta: { type: 'boolean' },
          },
          required: ['type', 'beta'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      let id = b.id ?? null;
      if (b.type === 'compte' && !id && b.email) {
        const [a] = await db
          .select({ id: t.account.id })
          .from(t.account)
          .where(eq(t.account.email, b.email.trim().toLowerCase()));
        id = a?.id ?? null;
      }
      if (!id) return err(reply, 404, 'introuvable');
      if (b.type === 'ecole') {
        const [s] = await db.select({ id: t.school.id }).from(t.school).where(eq(t.school.id, id));
        if (!s) return err(reply, 404, 'introuvable');
      }
      await setBeta(db, { type: b.type, id }, b.beta, req.auth!.accountId);
      await audit(db, req.auth!.accountId, b.beta ? 'beta.ajout' : 'beta.retrait', id, {
        type: b.type,
      });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- donner son avis

  app.post<{
    Body: {
      categorie: (typeof FEEDBACK_CATEGORIES)[number];
      texte?: string;
      page?: string;
      profil?: string;
      capture?: string;
    };
  }>(
    '/api/v1/avis',
    {
      bodyLimit: 700 * 1024,
      schema: {
        body: {
          type: 'object',
          properties: {
            categorie: { type: 'string', enum: [...FEEDBACK_CATEGORIES] },
            texte: { type: 'string', maxLength: 500 },
            page: { type: 'string', maxLength: 200 },
            profil: UUID,
            capture: { type: 'string', maxLength: 600 * 1024 },
          },
          required: ['categorie'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const pid = await profilDe(db, req, req.body.profil);
      const ctx = await contexteDe(db, req, pid);
      const f = await readFlags(db);
      if (!fonctionsPour(ctx, f.etats, f.regles).avis)
        return err(reply, 403, 'fonction_coupee', { fonction: 'avis' });
      const n = await feedbackRecent(db, req.auth.accountId);
      if (n.compte >= FEEDBACK_PER_DAY || n.tous >= FEEDBACK_PER_HOUR_ALL)
        return err(reply, 429, 'trop_d_avis');
      let capture: Buffer | null = null;
      let captureType: string | null = null;
      if (req.body.capture) {
        const m = IMG.exec(req.body.capture);
        if (!m) return err(reply, 400, 'capture_invalide');
        const buf = Buffer.from(m[2]!, 'base64');
        const magic = MAGIC[m[1]!]!;
        if (buf.length > FEEDBACK_CAPTURE_MAX || !magic.every((b, i) => buf[i] === b))
          return err(reply, 400, 'capture_invalide');
        capture = buf;
        captureType = m[1]!;
      }
      // un ENFANT ne laisse jamais de texte libre (catégorie et capture seulement)
      const texte = ctx.age === 'enfant' ? null : req.body.texte?.trim() || null;
      // page : chemin seulement (jamais de paramètres ni d'identifiants)
      const page = (req.body.page ?? '').split(/[?#]/)[0]!.slice(0, 200) || null;
      const id = await insertFeedback(db, {
        accountId: req.auth.accountId,
        profileId: pid,
        role: roleDe(ctx, pid),
        age: ctx.age,
        category: req.body.categorie,
        body: texte,
        page,
        appVersion: version,
        capture,
        captureType,
      });
      return reply.code(201).send({ id });
    },
  );

  app.get<{ Querystring: { statut?: string } }>(
    '/api/v1/admin/avis',
    {
      preHandler: needSupport,
      schema: {
        querystring: {
          type: 'object',
          properties: { statut: { type: 'string', enum: [...FEEDBACK_STATUS] } },
        },
      },
    },
    async (req) => ({ avis: await listFeedback(db, req.query.statut ?? null) }),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/avis/:id/capture',
    {
      preHandler: needSupport,
      schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } },
    },
    async (req, reply) => {
      const c = await feedbackCapture(db, req.params.id);
      if (!c) return err(reply, 404, 'introuvable');
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Type', c.type);
      return reply.send(c.data);
    },
  );

  app.put<{ Params: { id: string }; Body: { statut: string } }>(
    '/api/v1/admin/avis/:id',
    {
      preHandler: needSupport,
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        body: {
          type: 'object',
          properties: { statut: { type: 'string', enum: [...FEEDBACK_STATUS] } },
          required: ['statut'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!(await setFeedbackStatus(db, req.params.id, req.body.statut, req.auth!.accountId)))
        return err(reply, 404, 'introuvable');
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- usage sans traceur

  const usageSet = new Set<string>(USAGE_CLES);
  app.post<{ Body: { profil?: string; cles: string[] } }>(
    '/api/v1/usage',
    {
      bodyLimit: 4 * 1024,
      schema: {
        body: {
          type: 'object',
          properties: {
            profil: UUID,
            cles: {
              type: 'array',
              maxItems: 40,
              items: { type: 'string', maxLength: 40 },
            },
          },
          required: ['cles'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      // personne connectée seulement ; rien n'est compté pour un visiteur
      if (!req.auth) return reply.code(204).send();
      const pid = await profilDe(db, req, req.body.profil);
      const ctx = await contexteDe(db, req, pid);
      const cles = [...new Set(req.body.cles.filter((k) => usageSet.has(k)))];
      await recordUsage(db, pid ?? req.auth.accountId, roleDe(ctx, pid), cles);
      return reply.code(204).send();
    },
  );

  app.get<{ Querystring: { jours?: number; role?: string } }>(
    '/api/v1/admin/usage',
    {
      preHandler: needSupport,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            jours: { type: 'integer', minimum: 1, maximum: 365 },
            role: { type: 'string', enum: [...ROLES_FONCTION] },
          },
        },
      },
    },
    async (req) => {
      const jours = req.query.jours ?? 30;
      const rows = await usageReport(db, jours, SEUIL_ANONYMAT, req.query.role ?? null);
      const par = new Map(rows.map((r) => [r.cle, r]));
      return {
        jours,
        seuil: SEUIL_ANONYMAT,
        usage: USAGE_CLES.map(
          (cle) => par.get(cle) ?? { cle, personnesJours: 0, ouvertures: 0, sousSeuil: false },
        ),
        jamaisUtilisees: USAGE_CLES.filter((cle) => !par.has(cle)),
        lecons: await lessonStats(db, SEUIL_ANONYMAT),
      };
    },
  );
}
