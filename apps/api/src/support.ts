/**
 * Bêta-support (API) — « SIGNALER UN PROBLÈME » :
 *  - `POST /api/v1/problemes` : catégorie (bug, contenu à corriger, point religieux à vérifier, autre), description
 *    courte, capture facultative ; la page d'origine (chemin seul) et la version de l'application sont jointes ;
 *    aucune autre donnée (ni nom, ni e-mail, ni adresse IP). Un ENFANT n'envoie que la catégorie (jamais de
 *    texte libre ni d'image). Limites anti-abus par compte et par jour, et pour toute la plateforme par heure.
 *  - file de l'administrateur ou du support (second facteur) : liste filtrée par statut, capture sur demande,
 *    statut nouveau → en cours → réglé.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  insertProblem,
  listProblems,
  PROBLEM_BODY_MAX,
  PROBLEM_CAPTURE_MAX,
  PROBLEM_CATEGORIES,
  PROBLEM_PER_DAY,
  PROBLEM_PER_HOUR_ALL,
  PROBLEM_STATUS,
  problemCapture,
  problemRecent,
  readFlags,
  setProblemStatus,
  type Db,
} from '@awform/db';
import { fonctionsPour } from '@awform/school';
import { audit, hasRole } from './auth/service.js';
import { contexteDe, IMG, MAGIC, profilDe, roleDe } from './f5.js';
import { err, UUID } from './guards.js';

export function registerSupport(app: FastifyInstance, db: Db, version: string): void {
  const needSupport = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!hasRole(req.auth, 'admin', 'support')) return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  app.post<{
    Body: {
      categorie: (typeof PROBLEM_CATEGORIES)[number];
      texte?: string;
      page?: string;
      profil?: string;
      capture?: string;
    };
  }>(
    '/api/v1/problemes',
    {
      bodyLimit: 700 * 1024,
      schema: {
        body: {
          type: 'object',
          properties: {
            categorie: { type: 'string', enum: [...PROBLEM_CATEGORIES] },
            texte: { type: 'string', maxLength: PROBLEM_BODY_MAX },
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
      if (!fonctionsPour(ctx, f.etats, f.regles).signaler)
        return err(reply, 403, 'fonction_coupee', { fonction: 'signaler' });
      const n = await problemRecent(db, req.auth.accountId);
      if (n.compte >= PROBLEM_PER_DAY || n.tous >= PROBLEM_PER_HOUR_ALL)
        return err(reply, 429, 'trop_de_signalements');
      // un ENFANT n'envoie que la catégorie : ni texte libre, ni image
      const enfant = ctx.age === 'enfant';
      let capture: Buffer | null = null;
      let captureType: string | null = null;
      if (req.body.capture && !enfant) {
        const m = IMG.exec(req.body.capture);
        if (!m) return err(reply, 400, 'capture_invalide');
        const buf = Buffer.from(m[2]!, 'base64');
        const magic = MAGIC[m[1]!]!;
        if (buf.length > PROBLEM_CAPTURE_MAX || !magic.every((b, i) => buf[i] === b))
          return err(reply, 400, 'capture_invalide');
        capture = buf;
        captureType = m[1]!;
      }
      const texte = enfant ? null : req.body.texte?.trim() || null;
      // page : chemin seulement (jamais de paramètres ni d'identifiants)
      const page = (req.body.page ?? '').split(/[?#]/)[0]!.slice(0, 200) || null;
      const id = await insertProblem(db, {
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
    '/api/v1/admin/problemes',
    {
      preHandler: needSupport,
      schema: {
        querystring: {
          type: 'object',
          properties: { statut: { type: 'string', enum: [...PROBLEM_STATUS] } },
        },
      },
    },
    async (req) => ({ problemes: await listProblems(db, req.query.statut ?? null) }),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/problemes/:id/capture',
    {
      preHandler: needSupport,
      schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } },
    },
    async (req, reply) => {
      const c = await problemCapture(db, req.params.id);
      if (!c) return err(reply, 404, 'introuvable');
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Type', c.type);
      return reply.send(c.data);
    },
  );

  app.put<{ Params: { id: string }; Body: { statut: string } }>(
    '/api/v1/admin/problemes/:id',
    {
      preHandler: needSupport,
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        body: {
          type: 'object',
          properties: { statut: { type: 'string', enum: [...PROBLEM_STATUS] } },
          required: ['statut'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!(await setProblemStatus(db, req.params.id, req.body.statut, req.auth!.accountId)))
        return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'probleme.statut', req.params.id, {
        statut: req.body.statut,
      });
      return { ok: true };
    },
  );
}
