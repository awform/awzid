/**
 * Correction par l'enseignant des réponses libres (lot 18, V1-a ; CDC §2.1 « réponses libres corrigées par
 * l'enseignant »). Exercices des livres sans corrigé automatique (« question », « ouverte ») :
 *  - la FAMILLE envoie la réponse d'un élève inscrit dans la classe (enfant : code parent ; 2 000 caractères
 *    au plus ; un nouvel envoi remplace le précédent) ; elle voit la correction et peut supprimer l'envoi ;
 *  - l'ENSEIGNANT de la classe (second facteur) voit les réponses de ses élèves encore inscrits, avec la
 *    consigne du livre, et corrige : appréciation « acquis / en cours / à reprendre » et commentaire court
 *    (600 caractères) — aucune note chiffrée inventée ; journalisé ;
 *  - quitter la classe efface les réponses envoyées à cette classe ; supprimer le profil les efface toutes.
 */
import type { FastifyInstance } from 'fastify';
import {
  APPRECIATIONS,
  classFreeAnswers,
  correctFreeAnswer,
  deleteFreeAnswer,
  exerciseContents,
  freeAnswerById,
  openExercise,
  profileClasses,
  profileFreeAnswers,
  submitFreeAnswer,
  teacherClass,
  type Appreciation,
  type Db,
  type EditionRow,
} from '@awform/db';
import { audit } from './auth/service.js';
import { err, familyProfile, needTeacher, parentGate, UUID } from './guards.js';

export function registerCorrections(
  app: FastifyInstance,
  db: Db,
  edition: () => Promise<EditionRow | null>,
): void {
  // ---------------------------------------------------------------- famille

  app.post<{
    Params: { id: string };
    Body: { classId: string; exerciseId: string; itemIndex: number; answer: string };
  }>(
    '/api/v1/profiles/:id/reponses-libres',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['classId', 'exerciseId', 'itemIndex', 'answer'],
          additionalProperties: false,
          properties: {
            classId: UUID,
            exerciseId: { type: 'string', minLength: 1, maxLength: 80 },
            itemIndex: { type: 'integer', minimum: 0, maximum: 99 },
            answer: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await parentGate(db, req, reply, p.kind))) return reply;
      const answer = req.body.answer.trim();
      if (!answer) return err(reply, 400, 'reponse_vide');
      const classes = await profileClasses(db, p.id);
      if (!classes.some((c) => c.id === req.body.classId))
        return err(reply, 404, 'classe_inconnue');
      const ed = await edition();
      const ex = ed ? await openExercise(db, ed.id, req.body.exerciseId) : null;
      if (!ex) return err(reply, 400, 'exercice_non_ouvert');
      if (req.body.itemIndex >= Math.max(1, ex.items)) return err(reply, 400, 'item_inconnu');
      const r = await submitFreeAnswer(db, {
        profileId: p.id,
        classId: req.body.classId,
        unitId: ex.unitId,
        exerciseId: ex.id,
        itemIndex: req.body.itemIndex,
        answer,
      });
      await audit(db, req.auth!.accountId, 'reponse_libre.envoi', r.id, { profil: p.id });
      return reply.code(201).send({ reponse: r });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/reponses-libres',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      return {
        classes: (await profileClasses(db, p.id)).map((c) => ({ id: c.id, name: c.name })),
        reponses: await profileFreeAnswers(db, p.id),
      };
    },
  );

  app.delete<{ Params: { id: string; rid: string } }>(
    '/api/v1/profiles/:id/reponses-libres/:rid',
    {
      schema: {
        params: { type: 'object', required: ['id', 'rid'], properties: { id: UUID, rid: UUID } },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await deleteFreeAnswer(db, p.id, req.params.rid)))
        return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'reponse_libre.suppression', req.params.rid);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- enseignant de la classe

  app.get<{ Params: { id: string }; Querystring: { statut?: 'a_corriger' | 'corrigees' } }>(
    '/api/v1/ecole/classes/:id/reponses-libres',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { statut: { enum: ['a_corriger', 'corrigees'] } },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const pending =
        req.query.statut === 'a_corriger' ? true : req.query.statut === 'corrigees' ? false : null;
      const rows = await classFreeAnswers(db, cls.id, pending);
      const ed = await edition();
      const contents = ed
        ? await exerciseContents(
            db,
            ed.id,
            rows.map((r) => r.exerciseId),
          )
        : new Map<string, unknown>();
      return {
        reponses: rows.map((r) => ({ ...r, exercice: contents.get(r.exerciseId) ?? null })),
      };
    },
  );

  app.post<{ Params: { rid: string }; Body: { appreciation: Appreciation; commentaire?: string } }>(
    '/api/v1/ecole/reponses-libres/:rid/correction',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['rid'], properties: { rid: UUID } },
        body: {
          type: 'object',
          required: ['appreciation'],
          additionalProperties: false,
          properties: {
            appreciation: { enum: [...APPRECIATIONS] },
            commentaire: { type: 'string', maxLength: 600 },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await freeAnswerById(db, req.params.rid);
      // la réponse d'un élève ENCORE inscrit dans une classe de CET enseignant
      const cls = r ? await teacherClass(db, req.auth!.accountId, r.classId) : null;
      const still = r && cls ? await profileClasses(db, r.profileId) : [];
      if (!r || !cls || !still.some((c) => c.id === cls.id)) return err(reply, 404, 'introuvable');
      const c = await correctFreeAnswer(
        db,
        r.id,
        req.auth!.accountId,
        req.body.appreciation,
        req.body.commentaire?.trim() || null,
      );
      await audit(db, req.auth!.accountId, 'reponse_libre.correction', r.id, {
        appreciation: req.body.appreciation,
      });
      return { reponse: c };
    },
  );
}
