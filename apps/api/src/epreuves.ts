/**
 * Épreuves notées (lot 19, V1-b ; CDC §2.8) : bilans (barème /20) et examens (/100) passés dans l'application.
 *  - l'ENSEIGNANT de la classe (second facteur) ouvre une session sur un bilan ou l'examen du niveau de la
 *    classe, entre deux dates (30 jours au plus) ; il voit les copies, ajoute la partie notée hors application
 *    (lecture à voix haute, texte non préparé, dictée, questions ouvertes) et lit les TEXTES NON PRÉPARÉS du
 *    livre (jamais envoyés à l'élève) ; il peut fermer la session ;
 *  - l'ÉLÈVE inscrit (famille ; enfant : code parent) reçoit la projection d'épreuve (AUCUNE réponse ; colonne
 *    de droite des « relier » mélangée pour lui) pendant la session et envoie UNE copie, corrigée par le
 *    serveur (`gradeExam`) ; il voit sa note quand la session est fermée ;
 *  - REMÉDIATION : sous 8/20 (ramené au barème), les leçons à revoir (celles que le bilan couvre ; toutes pour
 *    l'examen) sont proposées à la famille et signalées à l'enseignant ;
 *  - la note officielle entre dans le tableau de suivi (la saisie « classe papier » de l'enseignant prime).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { examProjection, type Lesson } from '@awform/content';
import {
  classExamSessions,
  closeExamSession,
  createExamSession,
  examSessionById,
  illustrationsFor,
  insertSubmission,
  listUnits,
  profileClasses,
  profileExamSessions,
  sessionSubmissions,
  setTeacherPart,
  submissionById,
  teacherClass,
  unitFull,
  type Db,
  type EditionRow,
} from '@awform/db';
import {
  examScore,
  gradeExam,
  gradeTraining,
  needsRemediation,
  type ExamAnswers,
} from '@awform/grading';
import { audit } from './auth/service.js';
import { err, familyProfile, needTeacher, parentGate, UUID } from './guards.js';
import { neededIllustrations } from './needed.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const DAY = 86_400_000;

/** Ordre de la colonne de droite d'un « relier » pour CET élève (déterministe, secret de la session). */
export function relierOrder(
  seed: string,
  profileId: string,
  exerciseId: string,
  n: number,
): number[] {
  const idx = [...Array(n).keys()];
  let h = createHash('sha256').update(`${seed}|${profileId}|${exerciseId}`).digest();
  for (let i = n - 1; i > 0; i--) {
    if (i % 16 === 0) h = createHash('sha256').update(h).digest();
    const j = h.readUInt16BE((i * 2) % 32) % (i + 1);
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

/** Textes non préparés et scripts de dictée du livre : pour l'enseignant seulement. */
export function unpreparedTexts(content: unknown) {
  const L = isObj(content) ? content : {};
  const R = isObj(L.lecture) ? L.lecture : null;
  const Q = isObj(L.coran) ? L.coran : null;
  const E = isObj(L.ecriture) ? L.ecriture : null;
  const versets = Q && Array.isArray(Q.versets) ? (Q.versets as Obj[]) : [];
  return {
    lecture:
      R && R.non_prepare
        ? { vedette: R.vedette ?? null, phrases: R.phrases ?? [], paragraphes: R.paragraphes ?? [] }
        : null,
    versets: Q?.non_prepare ? versets : versets.filter((v) => v.non_prepare),
    dictee: E && Array.isArray(E.dictee) ? E.dictee : [],
  };
}

/**
 * Grille des parties « enseignant » du livre (`guide.bareme`, décision D6) : lue de façon tolérante —
 * liste d'objets {partie|label|nom|titre_fr : points|pts|sur|max} ou objet {intitulé : points} ; null si
 * absente (on retombe alors sur la saisie libre points / maximum).
 */
export function bookGrid(content: unknown): Array<{ label: string; points: number }> | null {
  const g = isObj(content) && isObj(content.guide) ? content.guide.bareme : undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const out: Array<{ label: string; points: number }> = [];
  if (Array.isArray(g))
    for (const x of g) {
      if (!isObj(x)) continue;
      const label = [x.partie, x.label, x.nom, x.titre_fr, x.intitule].find(
        (v) => typeof v === 'string',
      );
      const pts = [x.points, x.pts, x.sur, x.max].map(num).find((v) => v !== null);
      if (label && pts) out.push({ label: String(label), points: pts });
    }
  else if (isObj(g))
    for (const [label, v] of Object.entries(g)) {
      const pts =
        num(v) ??
        (isObj(v) ? [v.points, v.pts, v.sur, v.max].map(num).find((x) => x !== null) : null);
      if (pts) out.push({ label, points: pts });
    }
  return out.length ? out : null;
}

export function registerEpreuves(
  app: FastifyInstance,
  db: Db,
  edition: () => Promise<EditionRow | null>,
): void {
  /** leçons à revoir : celles que couvre le bilan (depuis le bilan précédent) ; toutes pour l'examen */
  async function remediationLessons(
    editionId: string,
    levelCode: string,
    unitN: number,
    kind: string,
  ) {
    const units = await listUnits(db, editionId, levelCode);
    const prev =
      kind === 'bilan'
        ? Math.max(0, ...units.filter((u) => u.kind === 'bilan' && u.n < unitN).map((u) => u.n))
        : 0;
    return units
      .filter((u) => u.kind === 'lecon' && u.n > prev && u.n < unitN)
      .map((u) => ({ id: u.id, numLecon: u.numLecon, titleFr: u.titleFr }));
  }

  // ---------------------------------------------------------------- enseignant

  app.post<{
    Params: { id: string };
    Body: { unitId: string; opensAt?: string; closesAt: string };
  }>(
    '/api/v1/ecole/classes/:id/epreuves',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['unitId', 'closesAt'],
          additionalProperties: false,
          properties: {
            unitId: { type: 'string', minLength: 1, maxLength: 60 },
            opensAt: { type: 'string', format: 'date-time' },
            closesAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const ed = await edition();
      const u = ed ? await unitFull(db, ed.id, req.body.unitId) : null;
      if (!u || (u.kind !== 'bilan' && u.kind !== 'examen'))
        return err(reply, 400, 'epreuve_invalide');
      if (!cls.levelCode || u.levelCode !== cls.levelCode)
        return err(reply, 400, 'niveau_de_la_classe');
      const opensAt = req.body.opensAt ? new Date(req.body.opensAt) : new Date();
      const closesAt = new Date(req.body.closesAt);
      if (!(closesAt > opensAt) || closesAt.getTime() - opensAt.getTime() > 30 * DAY)
        return err(reply, 400, 'dates_invalides');
      const s = await createExamSession(db, {
        classId: cls.id,
        unitId: u.id,
        // lot F1 (M2) : énoncé et corrigé FIGÉS sur l'édition ouverte maintenant
        editionId: ed!.id,
        bareme: u.kind === 'bilan' ? 20 : 100,
        opensAt,
        closesAt,
        seed: randomBytes(16).toString('hex'),
        createdBy: req.auth!.accountId,
      });
      await audit(db, req.auth!.accountId, 'epreuve.ouverture', s.id, {
        classe: cls.id,
        unite: u.id,
      });
      const { seed, ...pub } = s;
      void seed; // jamais transmis
      return reply.code(201).send({ epreuve: pub });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/epreuves',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      return { epreuves: await classExamSessions(db, cls.id) };
    },
  );

  /** session de CET enseignant, ou null */
  const mine = async (accountId: string, sid: string) => {
    const s = await examSessionById(db, sid);
    const cls = s ? await teacherClass(db, accountId, s.classId) : null;
    return s && cls ? { s, cls } : null;
  };

  app.get<{ Params: { sid: string } }>(
    '/api/v1/ecole/epreuves/:sid',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['sid'], properties: { sid: UUID } } },
    },
    async (req, reply) => {
      const m = await mine(req.auth!.accountId, req.params.sid);
      if (!m) return err(reply, 404, 'introuvable');
      const u = await unitFull(db, m.s.editionId, m.s.unitId);
      const copies = await sessionSubmissions(db, m.s.id, m.cls.id);
      await audit(db, req.auth!.accountId, 'epreuve.consultation', m.s.id);
      const { seed, ...pub } = m.s;
      void seed; // jamais transmis
      return {
        epreuve: { ...pub, titleFr: u?.titleFr ?? null, kind: u?.kind ?? null },
        textesNonPrepares: u ? unpreparedTexts(u.content) : null,
        // barème du livre pour la partie hors application (D6) ; null : saisie libre
        grille: u ? bookGrid(u.content) : null,
        // « écoute » : ce que l'adulte prononce (retiré de la copie de l'élève), dans l'ordre des items
        aDire: (u?.exercises ?? [])
          .filter((e) => e.type === 'ecoute')
          .map((e) => ({
            exerciseId: e.id,
            mots: (isObj(e.content) && Array.isArray(e.content.items)
              ? (e.content.items as Obj[])
              : []
            ).map((it) => String(it.dit ?? '')),
          })),
        copies: copies.map((c) => ({ ...c, remediation: needsRemediation(c.score, m.s.bareme) })),
      };
    },
  );

  app.post<{ Params: { sid: string } }>(
    '/api/v1/ecole/epreuves/:sid/fermer',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['sid'], properties: { sid: UUID } } },
    },
    async (req, reply) => {
      const m = await mine(req.auth!.accountId, req.params.sid);
      if (!m) return err(reply, 404, 'introuvable');
      await closeExamSession(db, m.s.id);
      await audit(db, req.auth!.accountId, 'epreuve.fermeture', m.s.id);
      return { ok: true };
    },
  );

  app.put<{
    Params: { sid: string; cid: string };
    Body: { points?: number | null; max?: number | null; parties?: number[] };
  }>(
    '/api/v1/ecole/epreuves/:sid/copies/:cid',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['sid', 'cid'], properties: { sid: UUID, cid: UUID } },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            points: { type: ['number', 'null'], minimum: 0, maximum: 1000 },
            max: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 1000 },
            // une note par partie de la grille du livre (D6), dans son ordre
            parties: {
              type: 'array',
              maxItems: 30,
              items: { type: 'number', minimum: 0, maximum: 1000 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const m = await mine(req.auth!.accountId, req.params.sid);
      const c = m ? await submissionById(db, req.params.cid) : null;
      if (!m || !c || c.sessionId !== m.s.id) return err(reply, 404, 'introuvable');
      const still = await profileClasses(db, c.profileId);
      if (!still.some((x) => x.id === m.cls.id)) return err(reply, 404, 'introuvable');
      let points = req.body.points ?? null;
      let max = req.body.max ?? null;
      if (req.body.parties) {
        // grille du livre : chaque partie bornée par ses points, maximum = total de la grille
        const u = await unitFull(db, m.s.editionId, m.s.unitId);
        const grid = u ? bookGrid(u.content) : null;
        const parts = req.body.parties;
        if (!grid || parts.length !== grid.length || parts.some((x, i) => x > grid[i]!.points))
          return err(reply, 400, 'points_invalides');
        points = parts.reduce((a, b) => a + b, 0);
        max = grid.reduce((a, b) => a + b.points, 0);
      }
      if ((points === null) !== (max === null) || (points !== null && max !== null && points > max))
        return err(reply, 400, 'points_invalides');
      const part = points !== null && max !== null ? { points, max } : null;
      const score = examScore({ points: c.autoPoints, max: c.autoMax }, part, m.s.bareme);
      await setTeacherPart(db, c.id, part, score);
      await audit(db, req.auth!.accountId, 'epreuve.note', c.id, { points, max });
      return { score, remediation: needsRemediation(score, m.s.bareme) };
    },
  );

  // ---------------------------------------------------------------- entraînement sur un bilan (D7)

  /**
   * L'appareil n'a plus le corrigé des bilans : il envoie les réponses, le serveur dit ce qui est juste item
   * par item (jamais la bonne réponse). L'examen se passe seulement en épreuve notée.
   */
  app.post<{ Params: { unit: string }; Body: { answers: ExamAnswers } }>(
    '/api/v1/units/:unit/corriger',
    {
      bodyLimit: 64 * 1024,
      schema: {
        params: {
          type: 'object',
          required: ['unit'],
          properties: { unit: { type: 'string', pattern: '^[a-z]{2,3}\\d{1,2}\\.l\\d{2}$' } },
        },
        body: {
          type: 'object',
          required: ['answers'],
          additionalProperties: false,
          properties: {
            answers: {
              type: 'object',
              maxProperties: 80,
              additionalProperties: { type: 'object', maxProperties: 120 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      const u = ed ? await unitFull(db, ed.id, req.params.unit) : null;
      if (!u) return err(reply, 404, 'introuvable');
      if (u.kind === 'examen') return err(reply, 409, 'examen_note_seulement');
      if (u.kind !== 'bilan') return err(reply, 400, 'correction_sur_appareil');
      const g = gradeTraining(u.exercises, req.body.answers);
      return { points: g.points, max: g.max, items: g.items };
    },
  );

  // ---------------------------------------------------------------- famille / élève

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/epreuves',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const ed = await edition();
      const now = new Date();
      const out = [];
      for (const { session: s, submission: sub } of await profileExamSessions(db, p.id)) {
        const u = await unitFull(db, s.editionId, s.unitId);
        const closed = s.closesAt <= now;
        // la note est montrée quand la session est fermée (mêmes conditions pour toute la classe)
        const score = closed && sub ? sub.score : null;
        const remediation = needsRemediation(score, s.bareme);
        out.push({
          id: s.id,
          unitId: s.unitId,
          titleFr: u?.titleFr ?? null,
          bareme: s.bareme,
          opensAt: s.opensAt,
          closesAt: s.closesAt,
          etat: sub
            ? closed
              ? 'notee'
              : 'envoyee'
            : s.opensAt > now
              ? 'a_venir'
              : closed
                ? 'fermee'
                : 'ouverte',
          score,
          remediation,
          aRevoir:
            remediation && u && ed ? await remediationLessons(ed.id, u.levelCode, u.n, u.kind) : [],
        });
      }
      return { epreuves: out };
    },
  );

  /** la session, si elle est ouverte pour ce profil (classe de l'élève, dates) */
  async function openFor(profileId: string, sid: string) {
    const s = await examSessionById(db, sid);
    if (!s) return null;
    const classes = await profileClasses(db, profileId);
    if (!classes.some((c) => c.id === s.classId)) return null;
    const now = new Date();
    return s.opensAt <= now && now < s.closesAt ? s : null;
  }

  app.get<{ Params: { id: string; sid: string } }>(
    '/api/v1/profiles/:id/epreuves/:sid',
    {
      schema: {
        params: { type: 'object', required: ['id', 'sid'], properties: { id: UUID, sid: UUID } },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const s = await openFor(p.id, req.params.sid);
      if (!s) return err(reply, 404, 'epreuve_fermee');
      // lot F1 (M2) : l'édition FIGÉE de la session, jamais l'édition publiée entre-temps
      const u = await unitFull(db, s.editionId, s.unitId);
      if (!u) return err(reply, 404, 'introuvable');
      // projection d'ÉPREUVE : aucune réponse ; « relier » : colonne de droite propre à l'élève
      // session ouverte : le texte non préparé est révélé (CDC §2.8), toujours sans aucune réponse
      const lesson = examProjection(u.content, u.levelCode, { revealUnprepared: true }) as Obj;
      const exs = Array.isArray(lesson.exercices) ? (lesson.exercices as Obj[]) : [];
      const full =
        isObj(u.content) && Array.isArray(u.content.exercices)
          ? (u.content.exercices as Obj[])
          : [];
      for (const e of u.exercises) {
        const src = full[e.position - 1];
        const dst = exs[e.position - 1];
        if (e.type !== 'relier' || !src || !dst || !Array.isArray(src.items)) continue;
        const items = src.items as Obj[];
        dst.droite = relierOrder(s.seed, p.id, e.id, items.length).map((k) => ({
          img: items[k]!.img,
          fr: items[k]!.fr,
        }));
      }
      const illustrations = await illustrationsFor(
        db,
        s.editionId,
        neededIllustrations(lesson as unknown as Lesson),
      );
      return {
        epreuve: { id: s.id, bareme: s.bareme, closesAt: s.closesAt, titleFr: u.titleFr },
        lesson,
        exercises: u.exercises.map((e) => ({ id: e.id, position: e.position, type: e.type })),
        illustrations,
      };
    },
  );

  app.post<{ Params: { id: string; sid: string }; Body: { answers: ExamAnswers } }>(
    '/api/v1/profiles/:id/epreuves/:sid/copie',
    {
      bodyLimit: 64 * 1024,
      schema: {
        params: { type: 'object', required: ['id', 'sid'], properties: { id: UUID, sid: UUID } },
        body: {
          type: 'object',
          required: ['answers'],
          additionalProperties: false,
          properties: {
            answers: {
              type: 'object',
              maxProperties: 80,
              additionalProperties: { type: 'object', maxProperties: 120 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await parentGate(db, req, reply, p.kind))) return reply;
      const s = await openFor(p.id, req.params.sid);
      if (!s) return err(reply, 409, 'epreuve_fermee');
      const u = await unitFull(db, s.editionId, s.unitId);
      if (!u) return err(reply, 404, 'introuvable');
      // réponses « relier » : position affichée → élément d'origine
      const answers: ExamAnswers = {};
      for (const e of u.exercises) {
        const given = req.body.answers[e.id];
        if (!isObj(given)) continue;
        if (e.type !== 'relier') {
          answers[e.id] = given;
          continue;
        }
        const n = isObj(e.content) && Array.isArray(e.content.items) ? e.content.items.length : 0;
        const order = relierOrder(s.seed, p.id, e.id, n);
        const mapped: Obj = {};
        for (const [k, v] of Object.entries(given))
          if (
            isObj(v) &&
            Number.isInteger(v.right) &&
            (v.right as number) >= 0 &&
            (v.right as number) < n
          )
            mapped[k] = { right: order[v.right as number] };
        answers[e.id] = mapped;
      }
      const g = gradeExam(u.exercises, answers);
      const r = await insertSubmission(db, {
        sessionId: s.id,
        profileId: p.id,
        answers,
        autoPoints: g.points,
        autoMax: g.max,
        detail: g.exercises,
        score: examScore(g, null, s.bareme),
      });
      if (!r) return err(reply, 409, 'copie_deja_envoyee');
      await audit(db, req.auth!.accountId, 'epreuve.copie', r.id, { profil: p.id, epreuve: s.id });
      // la note n'est montrée qu'à la fermeture de la session
      return reply.code(201).send({ copie: { id: r.id } });
    },
  );
}
