/**
 * « Signaler une erreur » dans le contenu (lot F1, revue d'architecture M1 ; CDC §5.8) :
 *  - toute personne CONNECTÉE signale un verset, un hadith, une règle de fiqh, une leçon ou un exercice
 *    (motif, commentaire court, extrait affiché) ; pas de pseudonyme ni de profil ; 10 signalements par 24 h,
 *    un seul par bloc et par jour ;
 *  - file de traitement : référent religieux (rôle « referent ») ou administrateur, second facteur exigé ;
 *    reçu → en examen → corrigé (erratum PUBLIC) ou rejeté (motif obligatoire) ; chaque décision est journalisée ;
 *  - SUSPENSION D'URGENCE par l'administrateur : leçon, exercice ou bloc masqué partout (message neutre),
 *    levée datée ;
 *  - errata et liste des suspensions publics (l'appareil masque ses copies hors ligne).
 * Lot F1 (E5) : l'appareil peut aussi signaler des réponses que le serveur a refusées (résumé, sans contenu).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BLOCK_PATH, blockAt, blockFingerprint } from '@awform/content';
import {
  createReport,
  currentEdition,
  decideReport,
  getUnitForStudent,
  hasRole,
  liftSuspension,
  publicErrata,
  REPORT_KINDS,
  REPORT_REASONS,
  REPORT_STATUSES,
  reportById,
  reportQueue,
  suspend,
  suspensionList,
  type Db,
  type ReportStatus,
} from '@awform/db';
import { audit } from './auth/service.js';
import { err, UUID } from './guards.js';
import { UNIT_ID, type Edition } from './routes-common.js';
import { currentSuspensions, invalidateSuspensions } from './suspensions.js';

const PATH = { type: 'string', maxLength: 120, pattern: BLOCK_PATH.source } as const;

export function registerSignalements(app: FastifyInstance, db: Db, edition: Edition): void {
  /** référent (rôle) ou administrateur, second facteur vérifié ; renvoie le rôle ou null (refus envoyé) */
  const reviewer = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      void err(reply, 401, 'non_connecte');
      return null;
    }
    const role = req.auth.roles.includes('admin')
      ? 'admin'
      : (await hasRole(db, req.auth.accountId, 'referent'))
        ? 'referent'
        : null;
    if (!role) {
      void err(reply, 403, 'reserve_referent');
      return null;
    }
    if (!req.auth.mfaVerified) {
      void err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
      return null;
    }
    return role;
  };

  // ---------------------------------------------------------------- signaler (famille, adulte, enseignant)

  app.post<{
    Body: {
      targetKind: (typeof REPORT_KINDS)[number];
      unitId: string;
      path?: string;
      ref?: string;
      excerpt?: string;
      fp?: string;
      reason: (typeof REPORT_REASONS)[number];
      comment?: string;
      edition?: string;
    };
  }>(
    '/api/v1/contenu/signalements',
    {
      bodyLimit: 8 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['targetKind', 'unitId', 'reason'],
          properties: {
            targetKind: { enum: [...REPORT_KINDS] },
            unitId: { type: 'string', pattern: UNIT_ID },
            path: PATH,
            ref: { type: 'string', maxLength: 120 },
            excerpt: { type: 'string', maxLength: 300 },
            fp: { type: 'string', pattern: '^[0-9a-f]{8}$' },
            reason: { enum: [...REPORT_REASONS] },
            comment: { type: 'string', maxLength: 500 },
            edition: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const ed = req.body.edition
        ? ((await currentEdition(db, req.body.edition)) ?? (await edition()))
        : await edition();
      const r = await createReport(db, {
        accountId: req.auth.accountId,
        editionId: ed?.id ?? null,
        targetKind: req.body.targetKind,
        unitId: req.body.unitId,
        path: req.body.path ?? '',
        ref: req.body.ref,
        excerpt: req.body.excerpt,
        fp: req.body.fp,
        reason: req.body.reason,
        comment: req.body.comment,
      });
      if (!r.ok)
        return err(
          reply,
          r.code === 'trop_de_signalements' ? 429 : r.code === 'deja_signale' ? 409 : 404,
          r.code,
        );
      return reply.code(201).send({ id: r.id });
    },
  );

  // ---------------------------------------------------------------- public : errata, suspensions

  app.get('/api/v1/contenu/errata', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return { errata: await publicErrata(db) };
  });

  app.get('/api/v1/contenu/suspensions', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return { suspensions: (await currentSuspensions(db)).list };
  });

  // ---------------------------------------------------------------- file du référent / de l'administrateur

  app.get<{ Querystring: { etat?: 'ouverts' | 'traites' } }>(
    '/api/v1/admin/signalements',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { etat: { enum: ['ouverts', 'traites'] } },
        },
      },
    },
    async (req, reply) => {
      const role = await reviewer(req, reply);
      if (!role) return reply;
      const statuses: ReportStatus[] =
        req.query.etat === 'traites' ? ['corrige', 'rejete'] : ['recu', 'en_examen'];
      await audit(db, req.auth!.accountId, 'signalements.consultation', null, { etat: statuses });
      return {
        role,
        signalements: await reportQueue(db, statuses),
        suspensions: await suspensionList(db),
      };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: {
      status: ReportStatus;
      decisionNote?: string;
      erratum?: string;
      fixedInEdition?: string;
    };
  }>(
    '/api/v1/admin/signalements/:id',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: {
            status: { enum: [...REPORT_STATUSES] },
            decisionNote: { type: 'string', maxLength: 1000 },
            erratum: { type: 'string', maxLength: 600 },
            fixedInEdition: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await reviewer(req, reply))) return reply;
      const r = await decideReport(db, req.params.id, req.auth!.accountId, req.body);
      if (!r.ok) return err(reply, r.code === 'introuvable' ? 404 : 400, r.code);
      await audit(db, req.auth!.accountId, 'signalement.decision', req.params.id, {
        statut: req.body.status,
      });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- suspension d'urgence (administrateur)

  /** administrateur avec second facteur ; sinon refus envoyé et false */
  const needAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const code = !req.auth
      ? 'non_connecte'
      : !req.auth.roles.includes('admin')
        ? 'reserve_admin'
        : !req.auth.mfaVerified
          ? req.auth.totpEnabled
            ? 'totp_requis'
            : 'mfa_a_configurer'
          : null;
    if (code) void err(reply, code === 'non_connecte' ? 401 : 403, code);
    return !code;
  };

  app.post<{ Body: { unitId: string; path?: string; reason: string; reportId?: string } }>(
    '/api/v1/admin/suspensions',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['unitId', 'reason'],
          properties: {
            unitId: { type: 'string', pattern: UNIT_ID },
            path: PATH,
            reason: { type: 'string', minLength: 1, maxLength: 500 },
            reportId: UUID,
          },
        },
      },
    },
    async (req, reply) => {
      if (!needAdmin(req, reply)) return reply;
      const ed = await edition();
      const unit = ed ? await getUnitForStudent(db, ed.id, req.body.unitId) : null;
      if (!unit) return err(reply, 404, 'introuvable');
      const path = req.body.path ?? '';
      let fp: string | null = null;
      if (path.startsWith('ex:')) {
        if (!unit.exercises.some((e) => e.id === path.slice(3)))
          return err(reply, 404, 'bloc_introuvable');
      } else if (path) {
        const node = blockAt(unit.lesson, path);
        if (node === undefined || node === null) return err(reply, 404, 'bloc_introuvable');
        fp = blockFingerprint(node);
      }
      if (req.body.reportId && !(await reportById(db, req.body.reportId)))
        return err(reply, 404, 'introuvable');
      const r = await suspend(db, {
        unitId: req.body.unitId,
        path,
        fp,
        reason: req.body.reason,
        reportId: req.body.reportId ?? null,
        by: req.auth!.accountId,
      });
      if (!r.ok) return err(reply, 409, r.code);
      invalidateSuspensions();
      await audit(db, req.auth!.accountId, 'contenu.suspension', r.id, {
        unite: req.body.unitId,
        chemin: path,
      });
      return reply.code(201).send({ id: r.id });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/admin/suspensions/:id/lever',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      if (!needAdmin(req, reply)) return reply;
      if (!(await liftSuspension(db, req.params.id, req.auth!.accountId)))
        return err(reply, 404, 'introuvable');
      invalidateSuspensions();
      await audit(db, req.auth!.accountId, 'contenu.suspension_levee', req.params.id);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- réponses refusées (appareil, lot F1 E5)

  /**
   * L'appareil signale les réponses que le serveur a refusées et qu'il garde de côté : résumé seulement
   * (nombre, motifs, édition), jamais le contenu des réponses ni le profil.
   */
  app.post<{ Body: { count: number; reasons: Record<string, number>; edition?: string } }>(
    '/api/v1/sync/rejets',
    {
      bodyLimit: 4 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'reasons'],
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 10000 },
            reasons: {
              type: 'object',
              maxProperties: 10,
              additionalProperties: { type: 'integer', minimum: 0, maximum: 10000 },
            },
            edition: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const reasons = Object.fromEntries(
        Object.entries(req.body.reasons).map(([k, v]) => [k.slice(0, 80), v]),
      );
      await audit(db, req.auth.accountId, 'synchro.rejets', null, {
        nombre: req.body.count,
        motifs: reasons,
        edition: req.body.edition ?? null,
      });
      return reply.code(202).send({ ok: true });
    },
  );
}
