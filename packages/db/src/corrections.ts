/**
 * Réponses libres corrigées par l'enseignant (lot 18, V1-a) : envoi par la famille (un texte par élève,
 * classe, exercice et item ; un nouvel envoi remplace le texte et remet la correction à zéro), liste pour
 * l'enseignant de la classe avec la consigne du livre, correction (appréciation + commentaire), lecture par
 * la famille. Seuls les exercices sans corrigé automatique des livres (« question », « ouverte ») sont admis.
 */
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export const OPEN_EXERCISE_TYPES: readonly string[] = ['question', 'ouverte'];
export const APPRECIATIONS = ['acquis', 'en_cours', 'a_reprendre'] as const;
export type Appreciation = (typeof APPRECIATIONS)[number];

/** L'exercice ouvert (et son nombre d'items dans l'édition servie), ou null. */
export async function openExercise(db: Db, editionId: string, exerciseId: string) {
  const [e] = await db
    .select({
      id: t.exercise.id,
      unitId: t.exercise.unitId,
      type: t.exercise.type,
      items: t.exerciseVersion.itemCount,
    })
    .from(t.exercise)
    .innerJoin(t.exerciseVersion, eq(t.exerciseVersion.exerciseId, t.exercise.id))
    .where(and(eq(t.exercise.id, exerciseId), eq(t.exerciseVersion.editionId, editionId)));
  return e && OPEN_EXERCISE_TYPES.includes(e.type) ? e : null;
}

export async function submitFreeAnswer(
  db: Db,
  r: {
    profileId: string;
    classId: string;
    unitId: string;
    exerciseId: string;
    itemIndex: number;
    answer: string;
  },
) {
  const [row] = await db
    .insert(t.freeAnswer)
    .values(r)
    .onConflictDoUpdate({
      target: [
        t.freeAnswer.profileId,
        t.freeAnswer.classId,
        t.freeAnswer.exerciseId,
        t.freeAnswer.itemIndex,
      ],
      set: {
        answer: r.answer,
        sentAt: sql`now()`,
        appreciation: null,
        comment: null,
        correctedBy: null,
        correctedAt: null,
      },
    })
    .returning({ id: t.freeAnswer.id, sentAt: t.freeAnswer.sentAt });
  return row!;
}

const PUBLIC = {
  id: t.freeAnswer.id,
  classId: t.freeAnswer.classId,
  unitId: t.freeAnswer.unitId,
  exerciseId: t.freeAnswer.exerciseId,
  itemIndex: t.freeAnswer.itemIndex,
  answer: t.freeAnswer.answer,
  sentAt: t.freeAnswer.sentAt,
  appreciation: t.freeAnswer.appreciation,
  comment: t.freeAnswer.comment,
  correctedAt: t.freeAnswer.correctedAt,
};

/** Réponses d'un profil (famille, export RGPD). */
export async function profileFreeAnswers(db: Db, profileId: string) {
  return db
    .select(PUBLIC)
    .from(t.freeAnswer)
    .where(eq(t.freeAnswer.profileId, profileId))
    .orderBy(desc(t.freeAnswer.sentAt));
}

/** Réponses d'une classe (enseignant) : à corriger d'abord, élèves encore inscrits seulement. */
export async function classFreeAnswers(db: Db, classId: string, pending: boolean | null = null) {
  const cond = [eq(t.freeAnswer.classId, classId)];
  if (pending === true) cond.push(isNull(t.freeAnswer.correctedAt));
  if (pending === false) cond.push(isNotNull(t.freeAnswer.correctedAt));
  return db
    .select({ ...PUBLIC, pseudonym: t.classPupil.displayName, profileId: t.freeAnswer.profileId })
    .from(t.freeAnswer)
    .innerJoin(
      t.classMember,
      and(
        eq(t.classMember.classId, t.freeAnswer.classId),
        eq(t.classMember.profileId, t.freeAnswer.profileId),
      ),
    )
    .leftJoin(
      t.classPupil,
      and(
        eq(t.classPupil.classId, t.freeAnswer.classId),
        eq(t.classPupil.profileId, t.freeAnswer.profileId),
      ),
    )
    .where(and(...cond))
    .orderBy(asc(t.freeAnswer.correctedAt), asc(t.freeAnswer.sentAt));
}

export async function freeAnswerById(db: Db, id: string) {
  const [r] = await db.select().from(t.freeAnswer).where(eq(t.freeAnswer.id, id));
  return r ?? null;
}

export async function correctFreeAnswer(
  db: Db,
  id: string,
  teacherId: string,
  appreciation: Appreciation,
  comment: string | null,
) {
  const [r] = await db
    .update(t.freeAnswer)
    .set({ appreciation, comment, correctedBy: teacherId, correctedAt: new Date() })
    .where(eq(t.freeAnswer.id, id))
    .returning(PUBLIC);
  return r ?? null;
}

export async function deleteFreeAnswer(db: Db, profileId: string, id: string) {
  const r = await db
    .delete(t.freeAnswer)
    .where(and(eq(t.freeAnswer.id, id), eq(t.freeAnswer.profileId, profileId)))
    .returning({ id: t.freeAnswer.id });
  return r.length > 0;
}

/** Exercices (contenu du livre dans l'édition servie) : la consigne montrée à l'enseignant, jamais générée. */
export async function exerciseContents(db: Db, editionId: string, exerciseIds: string[]) {
  const ids = [...new Set(exerciseIds)];
  if (!ids.length) return new Map<string, unknown>();
  const rows = await db
    .select({ id: t.exerciseVersion.exerciseId, content: t.exerciseVersion.content })
    .from(t.exerciseVersion)
    .where(
      and(eq(t.exerciseVersion.editionId, editionId), inArray(t.exerciseVersion.exerciseId, ids)),
    );
  return new Map(rows.map((r) => [r.id, r.content]));
}
