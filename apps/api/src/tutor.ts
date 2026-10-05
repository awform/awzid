/**
 * Tuteur IA (lot 9) — « Demander au tuteur » (élève) et « Questions en attente » (enseignant).
 * Désactivé par défaut (AWFORM_TUTEUR, voir @awform/tutor gate.ts). Le tuteur d'arabe ne sert que les
 * leçons de LANGUE (en*, ad*) : jamais les livres de religion. Pour un enfant ou un ado, le tuteur IA
 * n'est utilisé qu'avec le consentement « tuteur_ia » du parent (sinon : tuteur local seul).
 * Chaque réponse est journalisée (visible du parent) ; questions transmises et alertes enregistrées.
 */
import { consentGate } from './guards.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  allVerses,
  answerTutorQuestion,
  createTutorAlert,
  createTutorQuestion,
  getUnitForStudent,
  logTutor,
  monthSpent,
  questionsOf,
  registryItems,
  reportTutorLog,
  schema as t,
  teacherQuestions,
  tutorJournal,
  tutorTurns,
  type Db,
} from '@awform/db';
import {
  buildBank,
  classify,
  Orchestrator,
  QuranIndex,
  setupTutor,
  type Audience,
  type ContextPack,
  type TutorAction,
  type TutorSetup,
} from '@awform/tutor';
import { ownsProfile } from './auth/routes.js';
import { lawEvidence, TEXT_VERSION } from './auth/policy.js';
import { currentSuspensions, maskUnit } from './suspensions.js';

type Edition = () => Promise<{ id: string; code: string } | null>;
const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });
const UUID = { type: 'string', format: 'uuid' } as const;
const ARABIC_UNIT = /^(en|ad)[0-9]{1,2}\.l[0-9]{2}$/;
const ACTIONS: TutorAction[] = ['indice', 'explique', 'lecon', 'mot', 'question'];

export function registerTutor(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  setup?: TutorSetup,
): void {
  const tutor = setup ?? setupTutor(process.env);
  let quran: { index: QuranIndex; basmala: string } | null = null;
  const contexts = new Map<string, ContextPack>();

  const isTeacher = (req: FastifyRequest) =>
    !!req.auth && (req.auth.kind === 'enseignant' || req.auth.kind === 'admin');
  const needTeacher = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!isTeacher(req)) return err(reply, 403, 'reserve_aux_enseignants');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const owner = async (req: FastifyRequest, profileId: string) =>
    !!req.auth && (await ownsProfile(db, req.auth.accountId, profileId));

  async function context(editionId: string, unitId: string): Promise<ContextPack | null> {
    // lot F1 (M1) : un contenu suspendu n'entre jamais dans le contexte du tuteur
    const susp = await currentSuspensions(db);
    const key = `${editionId}|${unitId}|${susp.version}`;
    const hit = contexts.get(key);
    if (hit) return hit;
    const raw = await getUnitForStudent(db, editionId, unitId);
    if (!raw) return null;
    const unit = maskUnit(raw, susp.list);
    const json = JSON.stringify(unit.lesson);
    const ids = [...new Set(json.match(/HAD_[A-Z]{3}_\d{5}/g) ?? [])];
    const coranRefs = [...new Set(json.match(/\b\d{1,3}:\d{1,3}(?:-\d{1,3})?\b/g) ?? [])].slice(
      0,
      10,
    );
    const ctx: ContextPack = {
      unitId,
      titreFr: unit.titleFr ?? unitId,
      bank: buildBank(unitId, unit.lesson),
      coranRefs,
      registre: (await registryItems(db, editionId, ids)).filter((r) => r.statut === 'VERIFIE'),
    };
    contexts.set(key, ctx);
    return ctx;
  }

  async function audienceOf(
    profileId: string,
  ): Promise<{ audience: Audience; consent: boolean; country: string | null }> {
    const [p] = await db
      .select({
        kind: t.profile.kind,
        birthYear: t.profile.birthYear,
        owner: t.profile.ownerAccountId,
        country: t.account.country,
        accountKind: t.account.kind,
      })
      .from(t.profile)
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(eq(t.profile.id, profileId));
    if (!p) return { audience: 'enfant', consent: false, country: null };
    // audit MIN-2 : UNE seule source pour l'âge, le genre du profil (fixé à la création : moins de 13 ans
    // « enfant », moins de 18 ans « ado ») ; un profil adulte hors d'un compte adulte est traité en ado
    const audience: Audience =
      p.kind === 'adulte' ? (p.accountKind === 'adulte' ? 'adulte' : 'ado') : p.kind;
    if (audience === 'adulte') return { audience, consent: true, country: p.country };
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
    return { audience, consent: !!c, country: p.country };
  }

  app.get('/api/v1/tutor/status', async () => ({
    mode: tutor.mode,
    disponible: tutor.mode !== 'off',
    fournisseur: tutor.provider?.name ?? (tutor.mode === 'off' ? null : 'local'),
    reel: tutor.provider?.real ?? false,
    ...(tutor.blocked ? { bloque: tutor.blocked } : {}),
  }));

  app.post<{
    Params: { profileId: string };
    Body: { unitId: string; action: TutorAction; text?: string; word?: string; hour?: number };
  }>(
    '/api/v1/tutor/:profileId/ask',
    {
      schema: {
        params: { type: 'object', properties: { profileId: UUID }, required: ['profileId'] },
        body: {
          type: 'object',
          required: ['unitId', 'action'],
          additionalProperties: false,
          properties: {
            unitId: { type: 'string', maxLength: 20 },
            action: { type: 'string', enum: ACTIONS },
            text: { type: 'string', maxLength: 600 },
            word: { type: 'string', maxLength: 60 },
            hour: { type: 'integer', minimum: 0, maximum: 23 },
          },
        },
      },
    },
    async (req, reply) => {
      if (tutor.mode === 'off') return err(reply, 404, 'tuteur_desactive');
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const { profileId } = req.params;
      if (!(await owner(req, profileId))) return err(reply, 403, 'profil_interdit');
      const b = req.body;
      if (!ARABIC_UNIT.test(b.unitId)) return err(reply, 400, 'hors_perimetre');
      // audit CON-6 : le texte libre n'accompagne que « question » (classé avant tout appel au modèle)
      if (b.text !== undefined && b.action !== 'question')
        return err(reply, 400, 'texte_hors_question');
      const ed = await edition();
      if (!ed) return err(reply, 404, 'aucune_edition');
      const ctx = await context(ed.id, b.unitId);
      if (!ctx) return err(reply, 404, 'lecon_introuvable');
      if (!quran) {
        const verses = await allVerses(db);
        quran = { index: new QuranIndex(verses), basmala: verses.get('1:1') ?? '' };
      }
      const q = quran;
      // audit CON-7 : UNE demande à la fois par profil (verrou consultatif tenu pendant toute la demande) :
      // la dépense du mois est lue, l'appel fait et journalisé avant qu'une autre demande puisse la lire ; une
      // demande parallèle reçoit 429 aussitôt (aucune connexion ne reste en attente)
      const out = await db.transaction(async (tx) => {
        const lock = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${`tuteur:${profileId}`}, 0)) as ok`,
        );
        if (!(lock.rows[0] as { ok: boolean } | undefined)?.ok) return null;
        const who = await audienceOf(profileId);
        const orch = new Orchestrator({
          index: q.index,
          basmala: q.basmala,
          // sans consentement parental (enfant, ado) : tuteur local seul
          provider: who.consent ? tutor.provider : null,
          monthSpentMicros: await monthSpent(db, profileId),
          modelFor: tutor.modelFor,
        });
        const r = await orch.ask(
          {
            audience: who.audience,
            action: b.action,
            ...(b.text !== undefined ? { text: b.text } : {}),
            ...(b.word ? { word: b.word } : {}),
            ...(b.hour !== undefined ? { hour: b.hour } : {}),
            country: who.country,
            turn: await tutorTurns(db, profileId, b.unitId),
          },
          ctx,
        );
        const logId = await logTutor(db, {
          profileId,
          unitId: b.unitId,
          roleId: r.roleId,
          roleVersion: r.roleVersion,
          provider: r.provider,
          model: r.model,
          action: b.action,
          // audit CON-11 : le texte libre d'un ENFANT n'est jamais stocké (il n'est lu par personne)
          question:
            who.audience === 'enfant'
              ? (b.word ?? null)
              : b.text
                ? b.text.slice(0, 600)
                : (b.word ?? null),
          decision: r.decision,
          route: r.route,
          filter: r.filter,
          segments: r.segments,
          refused: r.refused ?? null,
          costMicros: r.costMicros,
        });
        if (r.transmit)
          await createTutorQuestion(db, {
            profileId,
            unitId: b.unitId,
            text: r.transmit.text,
            motif: r.transmit.motif,
          });
        if (r.alert) await createTutorAlert(db, { profileId, logId, motif: r.alert.motif });
        // audit CON-11 : texte libre d'un enfant (refusé au modèle) quand même CLASSÉ pour sa protection :
        // détresse ou rencontre → alerte (motif seul, sans le texte)
        else if (who.audience === 'enfant' && b.text) {
          const cat = classify(b.text);
          if (cat === 'detresse' || cat === 'rencontre')
            await createTutorAlert(db, { profileId, logId, motif: cat });
        }
        return { who, r, logId };
      });
      if (!out) return err(reply, 429, 'tuteur_occupe');
      const { who, r, logId } = out;
      return {
        logId,
        audience: who.audience,
        decision: r.decision,
        route: r.route,
        segments: r.segments,
        transmise: !!r.transmit,
        ...(r.refused ? { refus: r.refused } : {}),
        ia: r.route === 'modele',
        fournisseur: r.provider,
      };
    },
  );

  app.get<{ Params: { profileId: string } }>(
    '/api/v1/tutor/:profileId/questions',
    {
      schema: {
        params: { type: 'object', properties: { profileId: UUID }, required: ['profileId'] },
      },
    },
    async (req, reply) => {
      if (!(await owner(req, req.params.profileId))) return err(reply, 403, 'profil_interdit');
      return { questions: await questionsOf(db, req.params.profileId) };
    },
  );

  /** Journal du tuteur : le parent voit ce que le tuteur a dit à son enfant. */
  app.get<{ Params: { profileId: string } }>(
    '/api/v1/tutor/:profileId/journal',
    {
      schema: {
        params: { type: 'object', properties: { profileId: UUID }, required: ['profileId'] },
      },
    },
    async (req, reply) => {
      if (!(await owner(req, req.params.profileId))) return err(reply, 403, 'profil_interdit');
      const who = await audienceOf(req.params.profileId);
      return {
        consentement: who.consent,
        audience: who.audience,
        journal: await tutorJournal(db, req.params.profileId),
      };
    },
  );

  app.post<{ Params: { profileId: string; logId: string } }>(
    '/api/v1/tutor/:profileId/journal/:logId/signaler',
    {
      schema: {
        params: {
          type: 'object',
          properties: { profileId: UUID, logId: UUID },
          required: ['profileId', 'logId'],
        },
      },
    },
    async (req, reply) => {
      if (!(await owner(req, req.params.profileId))) return err(reply, 403, 'profil_interdit');
      if (!(await reportTutorLog(db, req.params.profileId, req.params.logId)))
        return err(reply, 404, 'introuvable');
      return { ok: true };
    },
  );

  /** Consentement du parent au tuteur IA pour un enfant ou un ado (retirable). */
  app.put<{ Params: { profileId: string }; Body: { actif: boolean } }>(
    '/api/v1/profiles/:profileId/tuteur',
    {
      schema: {
        params: { type: 'object', properties: { profileId: UUID }, required: ['profileId'] },
        body: {
          type: 'object',
          required: ['actif'],
          additionalProperties: false,
          properties: { actif: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!(await owner(req, req.params.profileId))) return err(reply, 403, 'profil_interdit');
      if (req.auth.kind !== 'parent') return err(reply, 403, 'reserve_au_parent');
      // audit MIN-4 / SEC-3 : code parent exigé (appareil partagé : l'enfant ne s'active pas l'IA lui-même)
      const [prof] = await db
        .select({ kind: t.profile.kind })
        .from(t.profile)
        .where(eq(t.profile.id, req.params.profileId));
      if (!(await consentGate(db, req, reply, prof?.kind ?? 'enfant'))) return reply;
      const where = and(
        eq(t.consent.profileId, req.params.profileId),
        eq(t.consent.type, 'tuteur_ia'),
        isNull(t.consent.withdrawnAt),
      );
      if (req.body.actif) {
        const [c] = await db.select({ id: t.consent.id }).from(t.consent).where(where).limit(1);
        if (!c)
          await db.insert(t.consent).values({
            accountId: req.auth.accountId,
            profileId: req.params.profileId,
            type: 'tuteur_ia',
            textVersion: TEXT_VERSION,
            // audit MIN-4 : pays et preuve de l'accord
            country: req.auth.country,
            evidence: {
              methode: 'code_parent',
              date: new Date().toISOString(),
              ...lawEvidence(req.auth.country),
            },
          });
      } else await db.update(t.consent).set({ withdrawnAt: new Date() }).where(where);
      return { actif: req.body.actif };
    },
  );

  // ---------------------------------------------------------------- enseignant
  app.get('/api/v1/teacher/questions', { preHandler: needTeacher }, async (req) => ({
    questions: await teacherQuestions(db, req.auth!.accountId),
  }));

  app.post<{ Params: { id: string }; Body: { answer: string } }>(
    '/api/v1/teacher/questions/:id/answer',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        body: {
          type: 'object',
          required: ['answer'],
          additionalProperties: false,
          properties: { answer: { type: 'string', minLength: 1, maxLength: 2000 } },
        },
      },
    },
    async (req, reply) => {
      if (
        !(await answerTutorQuestion(db, req.auth!.accountId, req.params.id, req.body.answer.trim()))
      )
        return err(reply, 404, 'introuvable');
      return { ok: true };
    },
  );
}
