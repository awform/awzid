/**
 * Chantier A27 — parcours par niveau et par classe (API de l'interface élève) :
 *  - espace d'une matière (niveau courant SEUL, anciens livres, aperçu du suivant) et accueil (« Ma prochaine
 *    activité », Mon arabe, Mon Coran, Mes sciences, Ma classe) ;
 *  - écriture (« Mon cahier », « J'écris le Coran » à partir du premier verset recopié dans le livre) ;
 *  - mots du Coran du niveau du livre (sens, racine, verset d'exemple ; couverture calculée) ;
 *  - TEST DE POSITIONNEMENT (arabe, sciences) et ÉPREUVE DE PASSAGE : construits UNIQUEMENT avec des exercices
 *    existants des épreuves de fin de niveau des livres, notés par le serveur (aucune réponse envoyée à l'élève),
 *    qui fixent `profile_level` (origine « positionnement » ou « épreuve ») ; le maître peut corriger (F2) ;
 *  - famille : demandes d'émancipation et propositions de réinscription (décisions D-F2 2 et 5).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNotNull } from 'drizzle-orm';
import { examProjection, levelParts, type Lesson } from '@awform/content';
import {
  acquireWords,
  currentLevelOf,
  decideReenrolment,
  expectedPlacementLevel,
  illustrationsFor,
  lastPassageAttempt,
  learnerClasses,
  learnerPath,
  levelSpace,
  listUnits,
  placementAttempts,
  quranWords,
  recordPlacement,
  reenrolmentOffers,
  schema as t,
  setProfileLevel,
  trackLevels,
  trackPrefix,
  unitFull,
  visibleProfiles,
  writingSpace,
  type Db,
  type Subject,
} from '@awform/db';
import { gradeExam, type ExamAnswers } from '@awform/grading';
import { audit, staffOnly } from './auth/service.js';
import { err, familyProfile, parentGate, UUID } from './guards.js';
import { neededIllustrations } from './needed.js';
import type { Edition } from './school-common.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Réussite d'un niveau (positionnement) ou d'une épreuve de passage : 70 % des points notés automatiquement. */
export const PASS_RATIO = 0.7;
/**
 * Exercices d'un test de positionnement par niveau : 4 (décision D-A27 du chef de projet : 2 ne plaçaient pas de façon
 * fiable) ; test ADAPTATIF : arrêt dès qu'un niveau est manqué.
 */
export const PLACEMENT_PER_LEVEL = 4;
/** Après une épreuve de passage manquée : nouvel essai le lendemain. */
export const PASSAGE_RETRY_MS = 20 * 3600_000;
/** Un test de positionnement est une suite d'essais rapprochés. */
const PLACEMENT_WINDOW_MS = 3 * 3600_000;

/** Types notés par le serveur sans audio ni ordre propre à l'élève (choix, vrai/faux, remise en ordre). */
const PASSAGE_TYPES = new Set(['vrai_faux', 'complete', 'premiere_lettre', 'qcm', 'ordre']);

/**
 * Exercices retenus dans l'épreuve de fin de niveau du livre (rien n'est réécrit : exercices du livre, dans son
 * ordre) : épreuve de passage = tous les exercices notables par le serveur ; test de positionnement = QUATRE
 * exercices notables par niveau (D-A27), ceux du livre de l'élève d'abord, puis ceux du cahier d'écriture (le choix
 * y est noté, la recopie reste sur papier) si le livre n'en a pas assez.
 */
export function selectExercises(
  exercises: ReadonlyArray<{ id: string; position: number; type: string; content: unknown }>,
  mode: 'positionnement' | 'epreuve',
) {
  const ok = (e: { type: string; content: unknown }) =>
    PASSAGE_TYPES.has(e.type) &&
    isObj(e.content) &&
    Array.isArray(e.content.items) &&
    e.content.items.length > 0;
  const list = exercises.filter(ok);
  if (mode === 'epreuve') return list;
  const cahier = (e: { content: unknown }) => isObj(e.content) && e.content.livre === 'ecriture';
  return [...list.filter((e) => !cahier(e)), ...list.filter(cahier)]
    .slice(0, PLACEMENT_PER_LEVEL)
    .sort((a, b) => a.position - b.position);
}
/**
 * Note des exercices retenus : types « langue » par `gradeExam` (mêmes règles que les épreuves) ; QCM des livres
 * de sciences : un point par item dont l'option choisie est la réponse du livre.
 */
export function gradeSelection(
  exercises: ReadonlyArray<{ id: string; type: string; content: unknown }>,
  answers: ExamAnswers,
): { points: number; max: number } {
  const lang = gradeExam(
    exercises.filter((e) => e.type !== 'qcm'),
    answers,
  );
  let points = lang.points;
  let max = lang.max;
  for (const e of exercises.filter((x) => x.type === 'qcm')) {
    const items = isObj(e.content) && Array.isArray(e.content.items) ? e.content.items : [];
    const given = answers[e.id] ?? {};
    items.forEach((it, k) => {
      const r = given[String(k)];
      max++;
      if (
        isObj(it) &&
        isObj(r) &&
        typeof r.choice === 'string' &&
        typeof it.reponse === 'string' &&
        r.choice === it.reponse
      )
        points++;
    });
  }
  return { points, max };
}

export function registerParcoursA27(app: FastifyInstance, db: Db, edition: Edition): void {
  const ids = (...keys: string[]) => ({
    params: {
      type: 'object',
      required: keys,
      properties: Object.fromEntries(keys.map((k) => [k, UUID])),
    },
  });
  const subjectParams = {
    params: {
      type: 'object',
      required: ['id', 'matiere'],
      properties: { id: UUID, matiere: { enum: ['arabe', 'sciences', 'coran'] } },
    },
  } as const;
  const testParams = {
    params: {
      type: 'object',
      required: ['id', 'matiere'],
      properties: {
        id: UUID,
        matiere: { enum: ['arabe', 'sciences'] },
        niveau: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
      },
    },
  } as const;
  const answersBody = {
    bodyLimit: 64 * 1024,
    body: {
      type: 'object',
      required: ['answers'],
      additionalProperties: false,
      properties: {
        answers: {
          type: 'object',
          maxProperties: 40,
          additionalProperties: { type: 'object', maxProperties: 60 },
        },
      },
    },
  } as const;

  const ed = async (reply: FastifyReply) => {
    const e = await edition();
    if (!e) void err(reply, 503, 'aucune_edition');
    return e;
  };

  /** Famille de l'élève, jamais une tablette de classe pour ce qui fixe un niveau (décision du maître). */
  const learner = async (req: FastifyRequest, reply: FastifyReply, id: string, fixes = false) => {
    if (fixes && req.auth?.tablet) {
      void err(reply, 403, 'decision_du_maitre');
      return null;
    }
    return familyProfile(db, req, reply, id);
  };

  // ---------------------------------------------------------------- espace, accueil, écriture, mots

  app.get<{ Params: { id: string; matiere: Subject } }>(
    '/api/v1/profiles/:id/espace/:matiere',
    { schema: subjectParams },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const s = await levelSpace(db, e.id, p.id, req.params.matiere);
      if (!s) return err(reply, 404, 'introuvable');
      const last = await lastPassageAttempt(db, p.id, req.params.matiere);
      return {
        edition: e.code,
        ...s,
        epreuve: last
          ? {
              le: last.at,
              reussie: last.passed,
              niveau: last.levelCode,
              attendre:
                !last.passed && Date.now() - last.at.getTime() < PASSAGE_RETRY_MS
                  ? new Date(last.at.getTime() + PASSAGE_RETRY_MS)
                  : null,
            }
          : null,
      };
    },
  );

  /** Accueil de l'élève : résumé des trois matières, piste Coran personnelle, classes et cercles. */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/accueil',
    { schema: ids('id') },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const sum = async (m: Subject) => {
        const s = await levelSpace(db, e.id, p.id, m);
        if (!s) return null;
        const at = (id: string | null) => s.unites.find((u) => u.id === id) ?? null;
        const brief = (id: string | null) => {
          const u = at(id);
          return u
            ? { id: u.id, n: u.n, kind: u.kind, numLecon: u.numLecon, titleFr: u.titleFr }
            : null;
        };
        return {
          courant: s.courant,
          proposition: s.proposition,
          progression: s.progression,
          enCours: brief(s.enCours),
          prochaine: brief(s.prochaine),
          derniere: s.derniere ? { ...s.derniere, ...brief(s.derniere.id) } : null,
          examen: s.examen,
          suivant: s.suivant ? { code: s.suivant.code, titre: s.suivant.titre } : null,
        };
      };
      const path = await learnerPath(db, e.id, p.id);
      return {
        edition: e.code,
        kind: p.kind,
        arabe: await sum('arabe'),
        sciences: await sum('sciences'),
        coran: {
          niveau: await sum('coran'),
          plan: path?.coran.plan ?? null,
          cercles: path?.coran.cercles ?? [],
        },
        classes: await learnerClasses(db, p.id),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/ecriture',
    { schema: ids('id') },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const w = await writingSpace(db, e.id, p.id);
      if (!w) return err(reply, 404, 'introuvable');
      return { edition: e.code, ...w };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/mots-coran',
    { schema: ids('id') },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const w = await quranWords(db, e.id, p.id);
      if (!w) return err(reply, 404, 'aucun_niveau');
      return w;
    },
  );

  /** mots validés par le petit jeu du niveau (sens choisi parmi ceux du livre) */
  app.post<{ Params: { id: string }; Body: { rangs: number[] } }>(
    '/api/v1/profiles/:id/mots-coran',
    {
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['rangs'],
          additionalProperties: false,
          properties: {
            rangs: {
              type: 'array',
              maxItems: 200,
              items: { type: 'integer', minimum: 1, maximum: 5000 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      return { ajoutes: await acquireWords(db, e.id, p.id, req.body.rangs) };
    },
  );

  // ---------------------------------------------------------------- positionnement et passage

  /** Épreuve de fin d'un niveau (examen du livre) avec les exercices retenus, en projection d'épreuve. */
  const testView = async (
    editionId: string,
    levelCode: string,
    mode: 'positionnement' | 'epreuve',
  ) => {
    const units = await listUnits(db, editionId, levelCode);
    const exam = units.find((u) => u.kind === 'examen');
    if (!exam) return null;
    const u = await unitFull(db, editionId, exam.id);
    if (!u) return null;
    const chosen = selectExercises(u.exercises, mode);
    if (!chosen.length) return null;
    const lesson = examProjection(u.content, u.levelCode, { revealUnprepared: true }) as Obj;
    const all = Array.isArray(lesson.exercices) ? (lesson.exercices as Obj[]) : [];
    const view: Obj = {
      // texte de l'épreuve (les questions de compréhension s'y rapportent)
      lecture: isObj(lesson.lecture) ? lesson.lecture : null,
      exercices: chosen.map((c) => all[c.position - 1] ?? {}),
    };
    const illustrations = await illustrationsFor(
      db,
      editionId,
      neededIllustrations(view as unknown as Lesson),
    );
    return {
      unit: exam.id,
      niveau: levelCode,
      titre: u.titleFr,
      lesson: view,
      exercises: chosen.map((c) => ({ id: c.id, type: c.type })),
      illustrations,
      chosen,
    };
  };

  /** État du test de positionnement d'une matière : filière, niveaux, niveau à tester, niveau courant. */
  app.get<{ Params: { id: string; matiere: 'arabe' | 'sciences' } }>(
    '/api/v1/profiles/:id/positionnement/:matiere',
    { schema: testParams },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const cur = await currentLevelOf(db, p.id, req.params.matiere);
      const prefix =
        (cur ? levelParts(cur.levelCode)?.prefix : null) ?? trackPrefix(req.params.matiere, p.kind);
      const levels = (await trackLevels(db, e.id, prefix!)).map((l) => l.code);
      const tries = await placementAttempts(
        db,
        p.id,
        req.params.matiere,
        'positionnement',
        new Date(Date.now() - PLACEMENT_WINDOW_MS),
      );
      return {
        piste: prefix,
        niveaux: levels,
        aTester: expectedPlacementLevel(levels, tries),
        courant: cur?.levelCode ?? null,
        origine: cur?.source ?? null,
      };
    },
  );

  app.get<{ Params: { id: string; matiere: 'arabe' | 'sciences'; niveau: string } }>(
    '/api/v1/profiles/:id/positionnement/:matiere/:niveau',
    { schema: testParams },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const v = await testView(e.id, req.params.niveau, 'positionnement');
      if (!v) return err(reply, 404, 'introuvable');
      // les exercices du livre (corrigé compris) ne quittent jamais le serveur
      return { ...v, chosen: undefined };
    },
  );

  /**
   * Un niveau du test : noté par le serveur. Réussi → niveau suivant à tester ; manqué (ou dernier niveau
   * réussi) → le test est fini et FIXE le niveau (origine « positionnement ») s'il est au-dessus du niveau
   * courant (un test ne fait jamais redescendre ; le maître ou la famille le peuvent).
   */
  app.post<{
    Params: { id: string; matiere: 'arabe' | 'sciences'; niveau: string };
    Body: { answers: ExamAnswers };
  }>(
    '/api/v1/profiles/:id/positionnement/:matiere/:niveau',
    { schema: { ...testParams, body: answersBody.body }, bodyLimit: answersBody.bodyLimit },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id, true);
      if (!p) return reply;
      if (!(await parentGate(db, req, reply, p.kind))) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const m = req.params.matiere;
      const cur = await currentLevelOf(db, p.id, m);
      const prefix = (cur ? levelParts(cur.levelCode)?.prefix : null) ?? trackPrefix(m, p.kind);
      const levels = (await trackLevels(db, e.id, prefix!)).map((l) => l.code);
      const since = new Date(Date.now() - PLACEMENT_WINDOW_MS);
      const expected = expectedPlacementLevel(
        levels,
        await placementAttempts(db, p.id, m, 'positionnement', since),
      );
      // ordre du test : le premier niveau (recommencer), ou celui qui suit le dernier niveau réussi
      if (req.params.niveau !== expected && req.params.niveau !== levels[0])
        return err(reply, 409, 'niveau_hors_ordre', { attendu: expected });
      const v = await testView(e.id, req.params.niveau, 'positionnement');
      if (!v) return err(reply, 404, 'introuvable');
      const g = gradeSelection(v.chosen, req.body.answers);
      const passed = g.max > 0 && g.points / g.max >= PASS_RATIO;
      await recordPlacement(db, {
        profileId: p.id,
        subject: m,
        kind: 'positionnement',
        levelCode: req.params.niveau,
        points: g.points,
        max: g.max,
        passed,
      });
      const i = levels.indexOf(req.params.niveau);
      const next = levels[i + 1];
      if (passed && next)
        return { points: g.points, max: g.max, reussi: true, fini: false, suivant: next };
      // fin du test : niveau = premier niveau manqué, ou le dernier s'il est réussi
      const found = req.params.niveau;
      const curN = cur ? (levelParts(cur.levelCode)?.n ?? 0) : 0;
      const samePrefix = cur ? levelParts(cur.levelCode)?.prefix === prefix : false;
      const raise = !cur || !samePrefix || (levelParts(found)?.n ?? 0) > curN;
      if (raise) {
        const scores = (await placementAttempts(db, p.id, m, 'positionnement', since))
          .slice(-levels.length)
          .map((a) => ({ niveau: a.levelCode, points: a.points, max: a.max, reussi: a.passed }));
        await setProfileLevel(db, p.id, found, 'positionnement', req.auth!.accountId, { scores });
        await audit(db, req.auth!.accountId, 'parcours.positionnement', p.id, { niveau: found });
      }
      return {
        points: g.points,
        max: g.max,
        reussi: passed,
        fini: true,
        niveau: raise ? found : cur!.levelCode,
        change: raise,
      };
    },
  );

  /** Épreuve de passage du niveau courant (examen du livre, exercices notés par le serveur). */
  app.get<{ Params: { id: string; matiere: 'arabe' | 'sciences' } }>(
    '/api/v1/profiles/:id/epreuve/:matiere',
    { schema: testParams },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const cur = await currentLevelOf(db, p.id, req.params.matiere);
      if (!cur) return err(reply, 409, 'aucun_niveau');
      const v = await testView(e.id, cur.levelCode, 'epreuve');
      if (!v) return err(reply, 404, 'introuvable');
      // les exercices du livre (corrigé compris) ne quittent jamais le serveur
      return { ...v, chosen: undefined };
    },
  );

  app.post<{
    Params: { id: string; matiere: 'arabe' | 'sciences' };
    Body: { answers: ExamAnswers };
  }>(
    '/api/v1/profiles/:id/epreuve/:matiere',
    { schema: { ...testParams, body: answersBody.body }, bodyLimit: answersBody.bodyLimit },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id, true);
      if (!p) return reply;
      if (!(await parentGate(db, req, reply, p.kind))) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      const m = req.params.matiere;
      const cur = await currentLevelOf(db, p.id, m);
      if (!cur) return err(reply, 409, 'aucun_niveau');
      const last = await lastPassageAttempt(db, p.id, m);
      if (last && !last.passed && Date.now() - last.at.getTime() < PASSAGE_RETRY_MS)
        return err(reply, 429, 'reessayer_plus_tard', {
          le: new Date(last.at.getTime() + PASSAGE_RETRY_MS),
        });
      const parts = levelParts(cur.levelCode);
      const levels = (await trackLevels(db, e.id, parts!.prefix)).map((l) => l.code);
      const next = levels[levels.indexOf(cur.levelCode) + 1];
      if (!next) return err(reply, 409, 'dernier_niveau');
      const v = await testView(e.id, cur.levelCode, 'epreuve');
      if (!v) return err(reply, 404, 'introuvable');
      const g = gradeSelection(v.chosen, req.body.answers);
      const passed = g.max > 0 && g.points / g.max >= PASS_RATIO;
      await recordPlacement(db, {
        profileId: p.id,
        subject: m,
        kind: 'epreuve',
        levelCode: cur.levelCode,
        points: g.points,
        max: g.max,
        passed,
      });
      if (passed) {
        await setProfileLevel(db, p.id, next, 'epreuve', req.auth!.accountId, {
          epreuve: v.unit,
          points: g.points,
          max: g.max,
        });
        await audit(db, req.auth!.accountId, 'parcours.epreuve', p.id, { niveau: next });
      }
      return {
        points: g.points,
        max: g.max,
        reussi: passed,
        niveau: passed ? next : cur.levelCode,
      };
    },
  );

  /** Commencer une matière au niveau proposé (premier niveau de la filière ; « choix de la famille »). */
  app.post<{ Params: { id: string; matiere: Subject } }>(
    '/api/v1/profiles/:id/commencer/:matiere',
    { schema: subjectParams },
    async (req, reply) => {
      const p = await learner(req, reply, req.params.id, true);
      if (!p) return reply;
      const e = await ed(reply);
      if (!e) return reply;
      if (await currentLevelOf(db, p.id, req.params.matiere))
        return err(reply, 409, 'deja_commence');
      const prefix = trackPrefix(req.params.matiere, p.kind);
      const first = prefix ? (await trackLevels(db, e.id, prefix))[0] : undefined;
      if (!first) return err(reply, 404, 'introuvable');
      await setProfileLevel(db, p.id, first.code, 'parent', req.auth!.accountId);
      return reply.code(201).send({ niveau: first.code });
    },
  );

  // ---------------------------------------------------------------- famille : demandes (D-F2 2 et 5)

  app.get('/api/v1/famille/demandes', async (req, reply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (staffOnly(req.auth) || req.auth.kind === 'ecole' || req.auth.tablet)
      return err(reply, 403, 'reserve_aux_familles');
    const profiles = await visibleProfiles(db, req.auth.accountId);
    const mine = profiles.filter((x) => x.lien === 'titulaire').map((x) => x.id);
    const asked = mine.length
      ? await db
          .select({ id: t.profile.id, at: t.profile.emancipationRequestAt })
          .from(t.profile)
          .where(
            and(
              isNotNull(t.profile.emancipationRequestAt),
              eq(t.profile.ownerAccountId, req.auth.accountId),
            ),
          )
      : [];
    return {
      emancipations: asked.map((a) => ({
        profileId: a.id,
        pseudonyme: profiles.find((x) => x.id === a.id)?.pseudonym ?? '',
        le: a.at,
      })),
      reinscriptions: (
        await reenrolmentOffers(
          db,
          profiles.map((x) => x.id),
        )
      ).map((o) => ({
        ...o,
        pseudonyme: profiles.find((x) => x.id === o.profileId)?.pseudonym ?? '',
      })),
    };
  });

  /** la famille confirme (ou refuse) d'un geste la réinscription proposée à la fin de l'année */
  app.post<{ Params: { id: string }; Body: { accepter: boolean } }>(
    '/api/v1/famille/reinscriptions/:id',
    {
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['accepter'],
          additionalProperties: false,
          properties: { accepter: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (staffOnly(req.auth) || req.auth.kind === 'ecole' || req.auth.tablet)
        return err(reply, 403, 'reserve_aux_familles');
      const profiles = await visibleProfiles(db, req.auth.accountId);
      const r = await decideReenrolment(
        db,
        req.params.id,
        profiles.map((x) => x.id),
        req.auth.accountId,
        req.body.accepter,
      );
      if (!r) return err(reply, 404, 'introuvable');
      await audit(
        db,
        req.auth.accountId,
        req.body.accepter ? 'classe.reinscription' : 'classe.reinscription.refus',
        r.profileId,
        { classe: r.classId },
      );
      return { ok: true };
    },
  );
}
