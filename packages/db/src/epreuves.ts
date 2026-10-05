/**
 * Épreuves notées (lot 19, V1-b) : sessions ouvertes par l'enseignant, copies des élèves (une par session),
 * partie notée par l'enseignant, notes officielles reprises par le tableau de suivi.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/** Unité (contenu COMPLET du livre, jamais envoyé tel quel à l'élève) et ses exercices dans l'édition. */
export async function unitFull(db: Db, editionId: string, unitId: string) {
  const [u] = await db
    .select({
      id: t.unit.id,
      levelCode: t.unit.levelCode,
      n: t.unit.n,
      kind: t.unit.kind,
      numBilan: t.unitVersion.numBilan,
      titleFr: t.unitVersion.titleFr,
      content: t.unitVersion.content,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(and(eq(t.unitVersion.editionId, editionId), eq(t.unitVersion.unitId, unitId)));
  if (!u) return null;
  const exercises = await db
    .select({
      id: t.exercise.id,
      position: t.exerciseVersion.position,
      type: t.exercise.type,
      content: t.exerciseVersion.content,
    })
    .from(t.exercise)
    .innerJoin(
      t.exerciseVersion,
      and(
        eq(t.exerciseVersion.exerciseId, t.exercise.id),
        eq(t.exerciseVersion.editionId, editionId),
      ),
    )
    .where(eq(t.exercise.unitId, unitId))
    .orderBy(asc(t.exerciseVersion.position));
  return { ...u, exercises };
}

export async function createExamSession(
  db: Db,
  s: {
    classId: string;
    unitId: string;
    /** édition figée à l'ouverture (lot F1, M2) */
    editionId: string;
    bareme: 20 | 100;
    opensAt: Date;
    closesAt: Date;
    seed: string;
    createdBy: string;
  },
) {
  const [r] = await db.insert(t.examSession).values(s).returning();
  return r!;
}

export async function examSessionById(db: Db, id: string) {
  const [r] = await db.select().from(t.examSession).where(eq(t.examSession.id, id));
  return r ?? null;
}

export async function classExamSessions(db: Db, classId: string) {
  return db
    .select({
      id: t.examSession.id,
      unitId: t.examSession.unitId,
      bareme: t.examSession.bareme,
      opensAt: t.examSession.opensAt,
      closesAt: t.examSession.closesAt,
      // A27 : colonne écrite EN ENTIER — un « id » nu se résolvait dans la sous-requête (s.id) : toujours 0 copie
      copies: sql<number>`(SELECT count(*)::int FROM exam_submission s WHERE s.session_id = "exam_session"."id")`,
    })
    .from(t.examSession)
    .where(eq(t.examSession.classId, classId))
    .orderBy(desc(t.examSession.opensAt));
}

/** Copies d'une session, élèves ENCORE inscrits seulement (pseudonyme de la liste de classe). */
export async function sessionSubmissions(db: Db, sessionId: string, classId: string) {
  return db
    .select({
      id: t.examSubmission.id,
      profileId: t.examSubmission.profileId,
      pseudonym: t.classPupil.displayName,
      autoPoints: t.examSubmission.autoPoints,
      autoMax: t.examSubmission.autoMax,
      detail: t.examSubmission.detail,
      teacherPoints: t.examSubmission.teacherPoints,
      teacherMax: t.examSubmission.teacherMax,
      score: t.examSubmission.score,
      submittedAt: t.examSubmission.submittedAt,
    })
    .from(t.examSubmission)
    .innerJoin(
      t.classMember,
      and(
        eq(t.classMember.profileId, t.examSubmission.profileId),
        eq(t.classMember.classId, classId),
      ),
    )
    .leftJoin(
      t.classPupil,
      and(
        eq(t.classPupil.profileId, t.examSubmission.profileId),
        eq(t.classPupil.classId, classId),
      ),
    )
    .where(eq(t.examSubmission.sessionId, sessionId))
    .orderBy(asc(t.classPupil.displayName));
}

/** Enregistre la copie ; null si l'élève en a déjà envoyé une (une seule copie par session). */
export async function insertSubmission(
  db: Db,
  s: {
    sessionId: string;
    profileId: string;
    answers: unknown;
    autoPoints: number;
    autoMax: number;
    detail: unknown;
    score: number | null;
  },
) {
  const [r] = await db
    .insert(t.examSubmission)
    .values(s)
    .onConflictDoNothing()
    .returning({ id: t.examSubmission.id, score: t.examSubmission.score });
  return r ?? null;
}

export async function submissionById(db: Db, id: string) {
  const [r] = await db.select().from(t.examSubmission).where(eq(t.examSubmission.id, id));
  return r ?? null;
}

export async function setTeacherPart(
  db: Db,
  id: string,
  part: { points: number; max: number } | null,
  score: number | null,
) {
  await db
    .update(t.examSubmission)
    .set({
      teacherPoints: part?.points ?? null,
      teacherMax: part?.max ?? null,
      score,
      gradedAt: new Date(),
    })
    .where(eq(t.examSubmission.id, id));
}

/** Sessions des classes d'un profil, avec sa copie éventuelle. */
export async function profileExamSessions(db: Db, profileId: string) {
  const classes = await db
    .select({ id: t.classMember.classId })
    .from(t.classMember)
    .where(eq(t.classMember.profileId, profileId));
  if (!classes.length) return [];
  const sessions = await db
    .select()
    .from(t.examSession)
    .where(
      inArray(
        t.examSession.classId,
        classes.map((c) => c.id),
      ),
    )
    .orderBy(desc(t.examSession.opensAt));
  const subs = sessions.length
    ? await db
        .select()
        .from(t.examSubmission)
        .where(
          and(
            eq(t.examSubmission.profileId, profileId),
            inArray(
              t.examSubmission.sessionId,
              sessions.map((s) => s.id),
            ),
          ),
        )
    : [];
  return sessions.map((s) => ({
    session: s,
    submission: subs.find((x) => x.sessionId === s.id) ?? null,
  }));
}

/** Copies d'un profil (export RGPD) : sans les réponses brutes du corrigé, avec les notes. */
export async function profileSubmissions(db: Db, profileId: string) {
  return db
    .select({
      sessionId: t.examSubmission.sessionId,
      answers: t.examSubmission.answers,
      autoPoints: t.examSubmission.autoPoints,
      autoMax: t.examSubmission.autoMax,
      teacherPoints: t.examSubmission.teacherPoints,
      teacherMax: t.examSubmission.teacherMax,
      score: t.examSubmission.score,
      submittedAt: t.examSubmission.submittedAt,
    })
    .from(t.examSubmission)
    .where(eq(t.examSubmission.profileId, profileId));
}

/** Notes officielles d'une classe : la plus récente par élève et par unité (tableau de suivi). */
export async function classOfficialScores(db: Db, classId: string) {
  const rows = await db
    .select({
      profileId: t.examSubmission.profileId,
      unitId: t.examSession.unitId,
      bareme: t.examSession.bareme,
      score: t.examSubmission.score,
      at: t.examSubmission.submittedAt,
    })
    .from(t.examSubmission)
    .innerJoin(t.examSession, eq(t.examSession.id, t.examSubmission.sessionId))
    .where(eq(t.examSession.classId, classId))
    .orderBy(asc(t.examSubmission.submittedAt));
  const out = new Map<string, { score: number; max: number }>();
  for (const r of rows)
    if (r.score !== null) out.set(`${r.profileId}|${r.unitId}`, { score: r.score, max: r.bareme });
  return out;
}

/** Ferme la session maintenant (au plus tôt juste après l'ouverture, contrainte closes > opens). */
export async function closeExamSession(db: Db, id: string) {
  await db
    .update(t.examSession)
    .set({ closesAt: sql`greatest(now(), ${t.examSession.opensAt} + interval '1 millisecond')` })
    .where(and(eq(t.examSession.id, id), sql`${t.examSession.closesAt} > now()`));
}
