/**
 * Tentatives, progression et tableau de bord (QUA-3, découpé de app.ts sans changement de comportement) :
 * réservés aux profils du compte connecté ; file hors ligne (réponses, hifẓ, entraînement) triée par genre.
 */
import type { FastifyInstance } from 'fastify';
import {
  computeProgress,
  dashboard,
  levelProgress,
  listUnits,
  recordAttempts,
  recordHifzEvents,
  recordPractice,
  type AttemptInput,
  type Db,
  type HifzEventInput,
  type PracticeInput,
} from '@awform/db';
import { ownsProfile } from './auth/routes.js';
import { LEVEL_CODE, notFound, UNIT_ID, UUID, type Edition } from './routes-common.js';

export function registerProgress(app: FastifyInstance, db: Db, edition: Edition): void {
  // ---------------------------------------------------------------- tentatives et progression (connecté)

  app.post<{ Body: { events: AttemptInput[] } }>(
    '/api/v1/attempts',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          properties: {
            events: {
              type: 'array',
              maxItems: 500,
              // audit SEC-8 : champs connus seulement (les autres sont retirés), longueurs bornées ; les
              // valeurs sont vérifiées ensuite événement par événement (un fautif est refusé SEUL, OFF-2)
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', maxLength: 40 },
                  profileId: { type: 'string', maxLength: 40 },
                  unitId: { type: 'string', maxLength: 40 },
                  eventType: { type: 'string', maxLength: 20 },
                  exerciseId: { type: 'string', maxLength: 80 },
                  exerciseHash: { type: 'string', maxLength: 128 },
                  itemIndex: {},
                  response: {},
                  deviceAt: { type: 'string', maxLength: 40 },
                  deviceId: { type: 'string', maxLength: 64 },
                  // lot F1 (E5, M3) : édition du contenu répondu et version du format de l'événement
                  edition: { type: 'string', maxLength: 60 },
                  v: { type: 'integer', minimum: 1, maximum: 99 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const owned = new Map<string, boolean>();
      const allowed: AttemptInput[] = [];
      const hifz: HifzEventInput[] = [];
      const practice: PracticeInput[] = [];
      const refused: Array<{ id: string; reason: string; code?: string }> = [];
      for (const e of req.body.events) {
        // audit SEC-8 : un événement ne dépasse jamais 8 Ko de JSON (réponse, détails compris)
        if (JSON.stringify(e ?? null).length > 8000) {
          refused.push({ id: String(e?.id ?? ''), reason: 'événement trop volumineux' });
          continue;
        }
        const pid = String(e?.profileId ?? '');
        if (!owned.has(pid))
          owned.set(pid, /^[0-9a-f-]{36}$/i.test(pid) && (await ownsProfile(db, req.auth, pid)));
        if (!owned.get(pid)) {
          // code stable : l'appareil GARDE ces réponses (autre compte sur un appareil partagé, audit OFF-3)
          refused.push({
            id: String(e?.id ?? ''),
            reason: 'profil non autorisé',
            code: 'autre_compte',
          });
          continue;
        }
        // événements du hifẓ : même file hors ligne, journal séparé
        if ((e.eventType as string) === 'hifz') {
          const r = (e.response ?? {}) as Partial<HifzEventInput>;
          hifz.push({
            ...r,
            id: e.id,
            profileId: pid,
            deviceAt: e.deviceAt,
          } as HifzEventInput);
        } else if ((e.eventType as string) === 'trace' || (e.eventType as string) === 'carte') {
          // entraînement (tracé, cartes de mots) : journal séparé, jamais de note
          const r = (e.response ?? {}) as Partial<PracticeInput>;
          practice.push({
            ...r,
            id: e.id,
            profileId: pid,
            kind: e.eventType as 'trace' | 'carte',
            deviceAt: e.deviceAt,
          } as PracticeInput);
        } else allowed.push(e);
      }
      const r = await recordAttempts(db, ed.id, allowed);
      const h = hifz.length
        ? await recordHifzEvents(db, hifz, req.auth.accountId, false)
        : { accepted: [], duplicates: [], rejected: [] };
      const pr = practice.length
        ? await recordPractice(db, practice)
        : { accepted: [], duplicates: [], rejected: [] };
      return {
        edition: ed.code,
        ...r,
        accepted: [
          ...r.accepted,
          ...[...h.accepted, ...pr.accepted].map((id) => ({ id, correct: null })),
        ],
        duplicates: [...r.duplicates, ...h.duplicates, ...pr.duplicates],
        rejected: [...r.rejected, ...h.rejected, ...pr.rejected, ...refused],
      };
    },
  );

  app.get<{ Querystring: { profile: string; level: string } }>(
    '/api/v1/progress',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['profile', 'level'],
          properties: {
            profile: { type: 'string', pattern: UUID },
            level: { type: 'string', pattern: LEVEL_CODE },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      if (!(await ownsProfile(db, req.auth, req.query.profile)))
        return reply.code(404).send(notFound('profil introuvable'));
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const units = await listUnits(db, ed.id, req.query.level);
      const rows = await levelProgress(
        db,
        req.query.profile,
        units.map((u) => u.id),
      );
      return { profile: req.query.profile, level: req.query.level, progress: rows };
    },
  );

  /**
   * Lot F1 (E5) : progression d'UNE leçon et exercices « à refaire » parce que leur corrigé a changé dans une
   * édition plus récente (les autres réponses restent comptées) — message affiché dans la leçon.
   */
  app.get<{ Querystring: { profile: string; unit: string } }>(
    '/api/v1/progress/unit',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['profile', 'unit'],
          properties: {
            profile: { type: 'string', pattern: UUID },
            unit: { type: 'string', pattern: UNIT_ID },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      if (!(await ownsProfile(db, req.auth, req.query.profile)))
        return reply.code(404).send(notFound('profil introuvable'));
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const p = await computeProgress(db, ed.id, req.query.profile, req.query.unit);
      return {
        unit: req.query.unit,
        status: p.status,
        score: p.score,
        bestScore: p.bestScore,
        revised: p.revised,
      };
    },
  );
  // ---------------------------------------------------------------- tableau de bord (parent, adulte)

  app.get<{ Params: { id: string }; Querystring: { today?: string } }>(
    '/api/v1/dashboard/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UUID } },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: { today: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      if (!(await ownsProfile(db, req.auth, req.params.id)))
        return reply.code(404).send(notFound('profil introuvable'));
      const today = req.query.today ?? new Date().toISOString().slice(0, 10);
      return { profile: req.params.id, today, ...(await dashboard(db, req.params.id, today)) };
    },
  );
}
