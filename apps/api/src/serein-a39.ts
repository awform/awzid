/**
 * Chantier A39 « MODE SEREIN » (décision du client, 06/10/2026) — l'évaluation ne doit jamais décourager.
 *  - mode d'évaluation d'un profil : lu (mode effectif, qui décide, historique), choisi par l'adulte lui-même
 *    ou par le PARENT pour un mineur (code parent s'il existe) ; l'ado exprime une préférence que le parent
 *    valide ; l'ENSEIGNANT fixe le mode de sa classe (mineurs de la classe ; hors classe, choix du parent) ;
 *  - récapitulatif bienveillant avant d'ouvrir le niveau suivant (dans TOUS les modes) : leçons faites, notions
 *    fragiles à revoir (2-3, jamais bloquant en mode serein) ;
 *  - mode serein : le niveau suivant s'ouvre quand les leçons du niveau sont faites (aucune épreuve exigée) ;
 *    l'adulte peut choisir son niveau lui-même ; l'épreuve reste possible, seulement pour un CERTIFICAT ;
 *  - suivi discret des notions fragiles pour le parent (récapitulatif) et l'enseignant (sa classe).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { levelParts } from '@awform/content';
import {
  classEvalMode,
  currentLevelOf,
  effectiveEvalMode,
  evalModeHistory,
  evalModesFor,
  FRAGILE_MAX,
  fragileNotions,
  isEvalMode,
  lessonsDoneSince,
  levelSpace,
  mondayUtc,
  schema as t,
  setClassEvalMode,
  setEvalModeWish,
  setProfileEvalMode,
  setProfileLevel,
  teacherClass,
  trackLevels,
  trackPrefix,
  type Db,
  type EvalMode,
} from '@awform/db';
import { audit } from './auth/service.js';
import { err, familyProfile, needTeacher, parentGate, UUID } from './guards.js';
import type { Edition } from './school-common.js';

const MODE = { enum: ['verification', 'douce', 'serein'] } as const;

/** Qui décide pour ce profil : l'adulte titulaire de son propre profil (« soi »), sinon le parent. */
async function deciderFor(db: Db, accountId: string, profileId: string) {
  const [r] = await db
    .select({ owner: t.profile.ownerAccountId, kind: t.profile.kind, acct: t.account.kind })
    .from(t.profile)
    .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
    .where(eq(t.profile.id, profileId));
  if (!r) return null;
  // adulte autonome, ou jeune devenu titulaire de son profil (émancipation) : il décide pour lui-même
  const soi = r.owner === accountId && r.acct === 'adulte';
  return { decider: soi ? ('soi' as const) : ('parent' as const), kind: r.kind };
}

export function registerSereinA39(app: FastifyInstance, db: Db, edition: Edition): void {
  const pid = {
    params: { type: 'object', required: ['id'], properties: { id: UUID } },
  } as const;
  const subjectParams = {
    params: {
      type: 'object',
      required: ['id', 'matiere'],
      properties: { id: UUID, matiere: { enum: ['arabe', 'sciences'] } },
    },
  } as const;
  const me = (req: FastifyRequest) => req.auth!.accountId;

  /** Décision de la famille : jamais depuis une tablette de classe ; code parent pour un mineur. */
  const familyDecision = async (req: FastifyRequest, reply: FastifyReply, id: string) => {
    if (req.auth?.tablet) {
      void err(reply, 403, 'decision_du_maitre');
      return null;
    }
    const p = await familyProfile(db, req, reply, id);
    if (!p) return null;
    const d = await deciderFor(db, me(req), p.id);
    if (!d) {
      void err(reply, 404, 'introuvable');
      return null;
    }
    // parent d'un enfant OU d'un ado : le code parent fait la différence entre le parent et le jeune
    if (d.decider === 'parent' && !(await parentGate(db, req, reply, 'enfant'))) return null;
    return { ...p, decider: d.decider };
  };

  // ---------------------------------------------------------------- mode d'un profil

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/mode-evaluation',
    { schema: pid },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const eff = (await effectiveEvalMode(db, p.id))!;
      const d = await deciderFor(db, me(req), p.id);
      const [w] = await db
        .select({ souhait: t.profile.evalModeWish, le: t.profile.evalModeWishAt })
        .from(t.profile)
        .where(eq(t.profile.id, p.id));
      return {
        ...eff,
        kind: p.kind,
        choix: evalModesFor(p.kind),
        // qui choisit depuis ce compte : l'adulte (soi) ou le parent (code parent) ; l'ado : une préférence
        moi: d?.decider ?? 'parent',
        souhait: w?.souhait ? { mode: w.souhait, le: w.le } : null,
        historique: await evalModeHistory(db, { profileId: p.id }),
      };
    },
  );

  app.put<{ Params: { id: string }; Body: { mode: EvalMode } }>(
    '/api/v1/profiles/:id/mode-evaluation',
    {
      schema: {
        ...pid,
        body: {
          type: 'object',
          required: ['mode'],
          additionalProperties: false,
          properties: { mode: MODE },
        },
      },
    },
    async (req, reply) => {
      const p = await familyDecision(req, reply, req.params.id);
      if (!p) return reply;
      if (!evalModesFor(p.kind).includes(req.body.mode)) return err(reply, 400, 'mode_non_propose');
      await setProfileEvalMode(db, p.id, req.body.mode, p.decider, me(req));
      await audit(db, me(req), 'parcours.mode', p.id, { mode: req.body.mode, par: p.decider });
      return { mode: (await effectiveEvalMode(db, p.id))!.mode, famille: req.body.mode };
    },
  );

  /** L'ADO exprime une préférence (sans code parent) ; le parent la valide (PUT) ou la refuse (DELETE). */
  app.post<{ Params: { id: string }; Body: { mode: EvalMode } }>(
    '/api/v1/profiles/:id/mode-evaluation/souhait',
    {
      schema: {
        ...pid,
        body: {
          type: 'object',
          required: ['mode'],
          additionalProperties: false,
          properties: { mode: MODE },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (p.kind !== 'ado') return err(reply, 403, 'reserve_aux_ados');
      await setEvalModeWish(db, p.id, req.body.mode);
      return reply.code(201).send({ souhait: req.body.mode });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/mode-evaluation/souhait',
    { schema: pid },
    async (req, reply) => {
      const p = await familyDecision(req, reply, req.params.id);
      if (!p) return reply;
      await setEvalModeWish(db, p.id, null);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- récapitulatif et niveau suivant

  const recap = async (editionId: string, profileId: string, m: 'arabe' | 'sciences') => {
    const s = await levelSpace(db, editionId, profileId, m);
    if (!s?.courant) return null;
    const fragiles = await fragileNotions(db, editionId, profileId, s.courant.code);
    const eff = (await effectiveEvalMode(db, profileId, m))!;
    return {
      niveau: s.courant.code,
      suivant: s.suivant?.code ?? null,
      mode: eff.mode,
      decideur: eff.decideur,
      lecons: s.progression,
      toutesFaites: s.progression.total > 0 && s.progression.faites >= s.progression.total,
      semaine: await lessonsDoneSince(db, profileId, mondayUtc()),
      // garde-fou : 2-3 notions recommandées (jamais bloquant en mode serein)
      fragiles: fragiles.slice(0, FRAGILE_MAX),
      recommandation: fragiles.length > 0,
    };
  };

  app.get<{ Params: { id: string; matiere: 'arabe' | 'sciences' } }>(
    '/api/v1/profiles/:id/recapitulatif/:matiere',
    { schema: subjectParams },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const e = await edition();
      if (!e) return err(reply, 503, 'aucune_edition');
      const r = await recap(e.id, p.id, req.params.matiere);
      if (!r) return err(reply, 409, 'aucun_niveau');
      return r;
    },
  );

  /**
   * MODE SEREIN : ouvre le niveau suivant quand les leçons du niveau sont faites (origine « lecons ») ; le
   * récapitulatif a été montré, l'élève a choisi « Continuer quand même » s'il restait des notions fragiles.
   */
  app.post<{
    Params: { id: string; matiere: 'arabe' | 'sciences' };
    Body: { continuerQuandMeme?: boolean };
  }>(
    '/api/v1/profiles/:id/niveau-suivant/:matiere',
    {
      schema: {
        ...subjectParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { continuerQuandMeme: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const e = await edition();
      if (!e) return err(reply, 503, 'aucune_edition');
      const r = await recap(e.id, p.id, req.params.matiere);
      if (!r) return err(reply, 409, 'aucun_niveau');
      if (r.mode !== 'serein') return err(reply, 409, 'epreuve_requise', { mode: r.mode });
      if (!r.toutesFaites) return err(reply, 409, 'lecons_a_finir', { lecons: r.lecons });
      if (!r.suivant) return err(reply, 409, 'dernier_niveau');
      await setProfileLevel(db, p.id, r.suivant, 'lecons', me(req), {
        lecons: r.lecons.total,
        fragiles: r.fragiles.map((f) => f.unitId),
        continuerQuandMeme: req.body?.continuerQuandMeme === true,
      });
      await audit(db, me(req), 'parcours.niveau_serein', p.id, { niveau: r.suivant });
      return { niveau: r.suivant };
    },
  );

  /** MODE SEREIN : l'élève adulte (ou le parent) choisit le niveau lui-même — le test est facultatif. */
  app.post<{ Params: { id: string; matiere: 'arabe' | 'sciences' }; Body: { niveau: string } }>(
    '/api/v1/profiles/:id/choisir-niveau/:matiere',
    {
      schema: {
        ...subjectParams,
        body: {
          type: 'object',
          required: ['niveau'],
          additionalProperties: false,
          properties: { niveau: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyDecision(req, reply, req.params.id);
      if (!p) return reply;
      const e = await edition();
      if (!e) return err(reply, 503, 'aucune_edition');
      const m = req.params.matiere;
      const eff = (await effectiveEvalMode(db, p.id, m))!;
      if (eff.mode !== 'serein') return err(reply, 409, 'epreuve_requise', { mode: eff.mode });
      const cur = await currentLevelOf(db, p.id, m);
      const prefix = (cur ? levelParts(cur.levelCode)?.prefix : null) ?? trackPrefix(m, p.kind);
      const levels = prefix ? (await trackLevels(db, e.id, prefix)).map((l) => l.code) : [];
      if (!levels.includes(req.body.niveau)) return err(reply, 400, 'niveau_inconnu');
      await setProfileLevel(db, p.id, req.body.niveau, 'choix', me(req));
      await audit(db, me(req), 'parcours.niveau_choisi', p.id, { niveau: req.body.niveau });
      return { niveau: req.body.niveau };
    },
  );

  // ---------------------------------------------------------------- classe de l'enseignant

  /** classe accessible à l'enseignant (ou à la direction de l'école) ; second facteur vérifié (preHandler) */
  const cls = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const c = await teacherClass(db, me(req), req.params.id);
    if (!c) void err(reply, 404, 'introuvable');
    return c;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/mode-evaluation',
    { schema: pid, preHandler: needTeacher },
    async (req, reply) => {
      const c = await cls(req, reply);
      if (!c) return reply;
      return {
        mode: await classEvalMode(db, c.id),
        historique: await evalModeHistory(db, { classId: c.id }),
      };
    },
  );

  /** L'enseignant décide pour sa classe (null : il laisse le choix aux familles). */
  app.put<{ Params: { id: string }; Body: { mode: EvalMode | null } }>(
    '/api/v1/ecole/classes/:id/mode-evaluation',
    {
      preHandler: needTeacher,
      schema: {
        ...pid,
        body: {
          type: 'object',
          required: ['mode'],
          additionalProperties: false,
          properties: { mode: { enum: ['verification', 'douce', 'serein', null] } },
        },
      },
    },
    async (req, reply) => {
      const c = await cls(req, reply);
      if (!c) return reply;
      const mode = isEvalMode(req.body.mode) ? req.body.mode : null;
      await setClassEvalMode(db, c.id, mode, me(req));
      await audit(db, me(req), 'classe.mode', c.id, { mode });
      return { mode };
    },
  );

  /** Suivi DISCRET de l'enseignant : notions fragiles de chaque élève de la classe (niveau de la classe). */
  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/notions-fragiles',
    { schema: pid, preHandler: needTeacher },
    async (req, reply) => {
      const c = await cls(req, reply);
      if (!c) return reply;
      const e = await edition();
      if (!e) return err(reply, 503, 'aucune_edition');
      const pupils = await db
        .select({
          id: t.classPupil.id,
          name: t.classPupil.displayName,
          profileId: t.classPupil.profileId,
        })
        .from(t.classPupil)
        .where(and(eq(t.classPupil.classId, c.id), isNull(t.classPupil.leftAt)));
      const out = [];
      for (const x of pupils) {
        if (!x.profileId) continue;
        const lv = c.levelCode ?? (await currentLevelOf(db, x.profileId, 'arabe'))?.levelCode;
        if (!lv) continue;
        const f = await fragileNotions(db, e.id, x.profileId, lv);
        if (f.length)
          out.push({ pupilId: x.id, nom: x.name, niveau: lv, fragiles: f.slice(0, FRAGILE_MAX) });
      }
      return { eleves: out };
    },
  );
}
