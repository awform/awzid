/** Tuteurs IA (lot 9) : journal, dépense du mois, questions transmises à l'enseignant, alertes. */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export type TutorLogRow = typeof t.tutorLog.$inferInsert;

export async function logTutor(db: Db, row: TutorLogRow): Promise<string> {
  const [r] = await db.insert(t.tutorLog).values(row).returning({ id: t.tutorLog.id });
  return r!.id;
}

/** Dépense du mois civil en cours (micro-dollars) : plafond par élève. */
export async function monthSpent(db: Db, profileId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [r] = await db
    .select({ s: sql<string>`coalesce(sum(${t.tutorLog.costMicros}), 0)` })
    .from(t.tutorLog)
    .where(and(eq(t.tutorLog.profileId, profileId), gte(t.tutorLog.createdAt, start)));
  return Number(r?.s ?? 0);
}

/** Nombre de demandes déjà faites sur une leçon (rotation des indices). */
export async function tutorTurns(db: Db, profileId: string, unitId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<string>`count(*)` })
    .from(t.tutorLog)
    .where(and(eq(t.tutorLog.profileId, profileId), eq(t.tutorLog.unitId, unitId)));
  return Number(r?.n ?? 0);
}

export async function tutorJournal(db: Db, profileId: string, limit = 50) {
  return db
    .select({
      id: t.tutorLog.id,
      unitId: t.tutorLog.unitId,
      action: t.tutorLog.action,
      question: t.tutorLog.question,
      decision: t.tutorLog.decision,
      route: t.tutorLog.route,
      segments: t.tutorLog.segments,
      refused: t.tutorLog.refused,
      provider: t.tutorLog.provider,
      model: t.tutorLog.model,
      reportedAt: t.tutorLog.reportedAt,
      createdAt: t.tutorLog.createdAt,
    })
    .from(t.tutorLog)
    .where(eq(t.tutorLog.profileId, profileId))
    .orderBy(desc(t.tutorLog.createdAt))
    .limit(limit);
}

export async function reportTutorLog(db: Db, profileId: string, logId: string): Promise<boolean> {
  const r = await db
    .update(t.tutorLog)
    .set({ reportedAt: new Date() })
    .where(and(eq(t.tutorLog.id, logId), eq(t.tutorLog.profileId, profileId)))
    .returning({ id: t.tutorLog.id });
  return r.length > 0;
}

export async function createTutorQuestion(
  db: Db,
  q: { profileId: string; unitId: string | null; text: string; motif: string },
): Promise<string> {
  const [r] = await db.insert(t.tutorQuestion).values(q).returning({ id: t.tutorQuestion.id });
  return r!.id;
}

export async function createTutorAlert(
  db: Db,
  a: { profileId: string; logId: string | null; motif: string },
): Promise<void> {
  await db.insert(t.tutorAlert).values(a);
}

/** Questions d'un élève (et les réponses de l'enseignant). */
export async function questionsOf(db: Db, profileId: string) {
  return db
    .select({
      id: t.tutorQuestion.id,
      unitId: t.tutorQuestion.unitId,
      text: t.tutorQuestion.text,
      status: t.tutorQuestion.status,
      answer: t.tutorQuestion.answer,
      answeredAt: t.tutorQuestion.answeredAt,
      createdAt: t.tutorQuestion.createdAt,
    })
    .from(t.tutorQuestion)
    .where(eq(t.tutorQuestion.profileId, profileId))
    .orderBy(desc(t.tutorQuestion.createdAt))
    .limit(30);
}

/** Questions en attente des élèves des classes de l'enseignant (pseudonyme seulement). */
export async function teacherQuestions(db: Db, teacherAccountId: string, status = 'en_attente') {
  return db
    .selectDistinctOn([t.tutorQuestion.id], {
      id: t.tutorQuestion.id,
      profileId: t.tutorQuestion.profileId,
      pseudonym: t.profile.pseudonym,
      className: t.classGroup.name,
      unitId: t.tutorQuestion.unitId,
      text: t.tutorQuestion.text,
      motif: t.tutorQuestion.motif,
      status: t.tutorQuestion.status,
      answer: t.tutorQuestion.answer,
      createdAt: t.tutorQuestion.createdAt,
    })
    .from(t.tutorQuestion)
    .innerJoin(t.classMember, eq(t.classMember.profileId, t.tutorQuestion.profileId))
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
    .innerJoin(t.profile, eq(t.profile.id, t.tutorQuestion.profileId))
    .where(
      and(eq(t.classGroup.teacherAccountId, teacherAccountId), eq(t.tutorQuestion.status, status)),
    )
    .orderBy(t.tutorQuestion.id);
}

/** Réponse de l'enseignant (seulement pour un élève d'une de ses classes). */
export async function answerTutorQuestion(
  db: Db,
  teacherAccountId: string,
  questionId: string,
  answer: string,
): Promise<boolean> {
  const mine = await db
    .select({ id: t.tutorQuestion.id })
    .from(t.tutorQuestion)
    .innerJoin(t.classMember, eq(t.classMember.profileId, t.tutorQuestion.profileId))
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
    .where(
      and(eq(t.tutorQuestion.id, questionId), eq(t.classGroup.teacherAccountId, teacherAccountId)),
    )
    .limit(1);
  if (!mine.length) return false;
  await db
    .update(t.tutorQuestion)
    .set({ answer, status: 'repondue', answeredBy: teacherAccountId, answeredAt: new Date() })
    .where(eq(t.tutorQuestion.id, questionId));
  return true;
}

/** Alertes non traitées (modération humaine). */
export async function openTutorAlerts(db: Db) {
  return db.select().from(t.tutorAlert).where(isNull(t.tutorAlert.handledAt));
}

/** Purge : journal du tuteur au-delà de 12 mois (ARCHITECTURE_V2 § 1.6). */
export async function purgeTutorLog(db: Db, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  const r = await db
    .delete(t.tutorLog)
    .where(sql`${t.tutorLog.createdAt} < ${limit}`)
    .returning({ id: t.tutorLog.id });
  return r.length;
}

/** Hadiths du registre de l'édition (le tuteur ne garde que le statut VERIFIE). */
export async function registryItems(db: Db, editionId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: t.registryEntry.id, statut: t.registryEntry.statut, data: t.registryEntry.data })
    .from(t.registryEntry)
    .where(
      and(
        eq(t.registryEntry.editionId, editionId),
        eq(t.registryEntry.kind, 'hadith'),
        inArray(t.registryEntry.id, ids),
      ),
    );
  return rows.map((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : undefined);
    return {
      id: r.id,
      statut: r.statut ?? '',
      ...(s('recueil') ? { recueil: s('recueil') } : {}),
      ...(d.numero !== undefined && d.numero !== null
        ? { numero: d.numero as number | string }
        : {}),
      ...(s('degre') ? { degre: s('degre') } : {}),
      ...(s('texte_ar') ? { texteAr: s('texte_ar') } : {}),
    };
  });
}
