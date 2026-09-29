/**
 * Espace école (lot 13) : liste de classe (profils inscrits par leur parent + élèves « papier »), groupes,
 * devoirs et coches, résultats saisis (classe papier), registre des certificats.
 * TOUTES les fonctions qui lisent des données d'élèves prennent l'identifiant de l'ENSEIGNANT et ne
 * renvoient rien si la classe n'est pas la sienne (protection des données des mineurs).
 */
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export type ClassRow = typeof t.classGroup.$inferSelect;
export type PupilRow = typeof t.classPupil.$inferSelect;

/** La classe, si elle appartient à cet enseignant ; sinon null. */
export async function teacherClass(
  db: Db,
  teacherAccountId: string,
  classId: string,
): Promise<ClassRow | null> {
  const [c] = await db
    .select()
    .from(t.classGroup)
    .where(and(eq(t.classGroup.id, classId), eq(t.classGroup.teacherAccountId, teacherAccountId)));
  return c ?? null;
}

/** L'élève et sa classe, si la classe appartient à cet enseignant ; sinon null. */
export async function teacherPupil(
  db: Db,
  teacherAccountId: string,
  pupilId: string,
): Promise<{ pupil: PupilRow; cls: ClassRow } | null> {
  const [r] = await db
    .select({ pupil: t.classPupil, cls: t.classGroup })
    .from(t.classPupil)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classPupil.classId))
    .where(and(eq(t.classPupil.id, pupilId), eq(t.classGroup.teacherAccountId, teacherAccountId)));
  return r ?? null;
}

export async function updateClassSettings(
  db: Db,
  classId: string,
  s: Partial<
    Pick<
      ClassRow,
      'name' | 'levelCode' | 'schoolName' | 'schoolNameAr' | 'place' | 'placeAr' | 'schoolYear'
    >
  >,
) {
  const [c] = await db.update(t.classGroup).set(s).where(eq(t.classGroup.id, classId)).returning();
  return c ?? null;
}

// ---------------------------------------------------------------- groupes

export async function listGroups(db: Db, classId: string) {
  return db
    .select({ id: t.classSubgroup.id, name: t.classSubgroup.name })
    .from(t.classSubgroup)
    .where(eq(t.classSubgroup.classId, classId))
    .orderBy(asc(t.classSubgroup.createdAt));
}

export async function createGroup(db: Db, classId: string, name: string) {
  const [g] = await db
    .insert(t.classSubgroup)
    .values({ classId, name })
    .returning({ id: t.classSubgroup.id, name: t.classSubgroup.name });
  return g!;
}

export async function deleteGroup(db: Db, classId: string, groupId: string): Promise<boolean> {
  const r = await db
    .delete(t.classSubgroup)
    .where(and(eq(t.classSubgroup.id, groupId), eq(t.classSubgroup.classId, classId)))
    .returning({ id: t.classSubgroup.id });
  return r.length > 0;
}

// ---------------------------------------------------------------- élèves

export interface PupilView {
  id: string;
  displayName: string;
  nameAr: string | null;
  gender: string | null;
  groupId: string | null;
  /** profil de l'application (null : élève « papier ») */
  profileId: string | null;
  avatar: string | null;
  kind: string | null;
}

export async function listPupils(db: Db, classId: string): Promise<PupilView[]> {
  return db
    .select({
      id: t.classPupil.id,
      displayName: t.classPupil.displayName,
      nameAr: t.classPupil.nameAr,
      gender: t.classPupil.gender,
      groupId: t.classPupil.groupId,
      profileId: t.classPupil.profileId,
      avatar: t.profile.avatar,
      kind: t.profile.kind,
    })
    .from(t.classPupil)
    .leftJoin(t.profile, eq(t.profile.id, t.classPupil.profileId))
    .where(eq(t.classPupil.classId, classId))
    .orderBy(asc(t.classPupil.displayName), asc(t.classPupil.id));
}

export async function addPaperPupil(
  db: Db,
  classId: string,
  p: {
    displayName: string;
    nameAr?: string | null;
    gender?: string | null;
    groupId?: string | null;
  },
) {
  const [r] = await db
    .insert(t.classPupil)
    .values({
      classId,
      displayName: p.displayName,
      nameAr: p.nameAr ?? null,
      gender: p.gender ?? null,
      groupId: p.groupId ?? null,
    })
    .returning();
  return r!;
}

export async function updatePupil(
  db: Db,
  pupilId: string,
  p: Partial<Pick<PupilRow, 'displayName' | 'nameAr' | 'gender' | 'groupId'>>,
) {
  const [r] = await db.update(t.classPupil).set(p).where(eq(t.classPupil.id, pupilId)).returning();
  return r ?? null;
}

/** Retire l'élève de la classe (un profil de l'application quitte aussi la classe). */
export async function removePupil(db: Db, pupil: PupilRow) {
  await db.transaction(async (tx) => {
    if (pupil.profileId)
      await tx
        .delete(t.classMember)
        .where(
          and(
            eq(t.classMember.classId, pupil.classId),
            eq(t.classMember.profileId, pupil.profileId),
          ),
        );
    await tx.delete(t.classPupil).where(eq(t.classPupil.id, pupil.id));
  });
}

// ---------------------------------------------------------------- devoirs

export type AssignmentRow = typeof t.classAssignment.$inferSelect;

export async function listAssignments(db: Db, classId: string): Promise<AssignmentRow[]> {
  return db
    .select()
    .from(t.classAssignment)
    .where(eq(t.classAssignment.classId, classId))
    .orderBy(asc(t.classAssignment.dueDay), asc(t.classAssignment.createdAt));
}

export async function createAssignment(
  db: Db,
  a: Pick<AssignmentRow, 'classId' | 'kind' | 'target' | 'dueDay'> & {
    groupId?: string | null;
    note?: string | null;
  },
) {
  const [r] = await db
    .insert(t.classAssignment)
    .values({ ...a, groupId: a.groupId ?? null, note: a.note ?? null })
    .returning();
  return r!;
}

export async function deleteAssignment(db: Db, classId: string, id: string): Promise<boolean> {
  const r = await db
    .delete(t.classAssignment)
    .where(and(eq(t.classAssignment.id, id), eq(t.classAssignment.classId, classId)))
    .returning({ id: t.classAssignment.id });
  return r.length > 0;
}

export async function assignmentById(db: Db, id: string) {
  const [a] = await db.select().from(t.classAssignment).where(eq(t.classAssignment.id, id));
  return a ?? null;
}

export async function setMark(db: Db, assignmentId: string, pupilId: string, done: boolean | null) {
  if (done === null) {
    await db
      .delete(t.assignmentMark)
      .where(
        and(eq(t.assignmentMark.assignmentId, assignmentId), eq(t.assignmentMark.pupilId, pupilId)),
      );
    return;
  }
  await db
    .insert(t.assignmentMark)
    .values({ assignmentId, pupilId, done })
    .onConflictDoUpdate({
      target: [t.assignmentMark.assignmentId, t.assignmentMark.pupilId],
      set: { done, markedAt: new Date() },
    });
}

export async function marksOf(db: Db, assignmentIds: string[]) {
  if (!assignmentIds.length) return [];
  return db
    .select()
    .from(t.assignmentMark)
    .where(inArray(t.assignmentMark.assignmentId, assignmentIds));
}

/** Devoirs d'un profil d'élève (toutes ses classes ; groupe respecté). Pour l'élève et son parent. */
export async function profileAssignments(db: Db, profileId: string) {
  const rows = await db
    .select({
      a: t.classAssignment,
      className: t.classGroup.name,
      pupilId: t.classPupil.id,
      pupilGroup: t.classPupil.groupId,
    })
    .from(t.classPupil)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classPupil.classId))
    .innerJoin(t.classAssignment, eq(t.classAssignment.classId, t.classPupil.classId))
    .where(eq(t.classPupil.profileId, profileId))
    .orderBy(asc(t.classAssignment.dueDay));
  return rows.filter((r) => !r.a.groupId || r.a.groupId === r.pupilGroup);
}

// ---------------------------------------------------------------- classe papier

export type PaperRow = typeof t.paperResult.$inferSelect;

export async function paperResults(db: Db, pupilIds: string[], levelCode?: string) {
  if (!pupilIds.length) return [];
  return db
    .select()
    .from(t.paperResult)
    .where(
      levelCode
        ? and(inArray(t.paperResult.pupilId, pupilIds), eq(t.paperResult.levelCode, levelCode))
        : inArray(t.paperResult.pupilId, pupilIds),
    );
}

export async function savePaperResult(
  db: Db,
  r: Pick<PaperRow, 'pupilId' | 'levelCode' | 'item' | 'score' | 'max' | 'day'> & {
    details?: unknown;
    enteredBy: string;
  },
) {
  await db
    .insert(t.paperResult)
    .values({ ...r, details: r.details ?? null })
    .onConflictDoUpdate({
      target: [t.paperResult.pupilId, t.paperResult.levelCode, t.paperResult.item],
      set: {
        score: r.score,
        max: r.max,
        day: r.day,
        details: r.details ?? null,
        enteredBy: r.enteredBy,
        updatedAt: new Date(),
      },
    });
}

export async function deletePaperResult(db: Db, pupilId: string, levelCode: string, item: string) {
  await db
    .delete(t.paperResult)
    .where(
      and(
        eq(t.paperResult.pupilId, pupilId),
        eq(t.paperResult.levelCode, levelCode),
        eq(t.paperResult.item, item),
      ),
    );
}

/** Progression (profils de l'application) sur des unités. */
export async function progressOf(db: Db, profileIds: string[], unitIds: string[]) {
  if (!profileIds.length || !unitIds.length) return [];
  return db
    .select({
      profileId: t.progress.profileId,
      unitId: t.progress.unitId,
      status: t.progress.status,
      bestScore: t.progress.bestScore,
    })
    .from(t.progress)
    .where(and(inArray(t.progress.profileId, profileIds), inArray(t.progress.unitId, unitIds)));
}

/** Événements de hifẓ utiles au suivi (passages appris, validations du maître). */
export async function hifzEventsOf(db: Db, profileIds: string[]) {
  if (!profileIds.length) return [];
  return db
    .select({
      profileId: t.hifzEvent.profileId,
      day: t.hifzEvent.day,
      part: t.hifzEvent.part,
      kind: t.hifzEvent.kind,
      source: t.hifzEvent.source,
      details: t.hifzEvent.details,
    })
    .from(t.hifzEvent)
    .where(inArray(t.hifzEvent.profileId, profileIds))
    .orderBy(asc(t.hifzEvent.day));
}

// ---------------------------------------------------------------- certificats

export type CertificateRow = typeof t.certificate.$inferSelect;

/**
 * Délivre un certificat : numéro unique AWF-<PRÉFIXE>-<ANNÉE>-<NNNN> (suivant du registre), document figé.
 * Le numéro est calculé dans la transaction ; en cas de collision (deux délivrances simultanées), on réessaie.
 */
export async function issueCertificate(
  db: Db,
  c: {
    prefix: string;
    year: number;
    kind: 'niveau' | 'hifz';
    classId: string;
    pupilId: string;
    issuedBy: string;
    subject: string;
    document: (number: string) => object;
  },
): Promise<CertificateRow> {
  const head = `AWF-${c.prefix.toUpperCase()}-${c.year}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [last] = await tx
          .select({ number: t.certificate.number })
          .from(t.certificate)
          .where(like(t.certificate.number, `${head}%`))
          .orderBy(desc(t.certificate.number))
          .limit(1);
        const seq = last ? Number(last.number.slice(head.length)) + 1 : 1;
        const number = `${head}${String(seq).padStart(4, '0')}`;
        const [row] = await tx
          .insert(t.certificate)
          .values({
            number,
            kind: c.kind,
            classId: c.classId,
            pupilId: c.pupilId,
            issuedBy: c.issuedBy,
            subject: c.subject,
            document: c.document(number),
          })
          .returning();
        return row!;
      });
    } catch (e) {
      if (
        !/certificate_number_unique|duplicate key/.test(String((e as Error).message ?? e)) ||
        attempt === 4
      )
        throw e;
    }
  }
  throw new Error('numéro de certificat indisponible');
}

export async function classCertificates(db: Db, classId: string) {
  return db
    .select({
      id: t.certificate.id,
      number: t.certificate.number,
      kind: t.certificate.kind,
      pupilId: t.certificate.pupilId,
      subject: t.certificate.subject,
      issuedAt: t.certificate.issuedAt,
    })
    .from(t.certificate)
    .where(eq(t.certificate.classId, classId))
    .orderBy(asc(t.certificate.number));
}

/** Un certificat, pour l'enseignant qui l'a délivré ou celui de la classe. */
export async function teacherCertificate(db: Db, teacherAccountId: string, id: string) {
  const [r] = await db
    .select({ c: t.certificate, owner: t.classGroup.teacherAccountId })
    .from(t.certificate)
    .leftJoin(t.classGroup, eq(t.classGroup.id, t.certificate.classId))
    .where(eq(t.certificate.id, id));
  if (!r) return null;
  if (r.c.issuedBy !== teacherAccountId && r.owner !== teacherAccountId) return null;
  return r.c;
}

// ---------------------------------------------------------------- documents d'évaluation, niveau

export async function evalDocs(db: Db, editionId: string): Promise<Record<string, unknown>> {
  const rows = await db.select().from(t.evalDoc).where(eq(t.evalDoc.editionId, editionId));
  return Object.fromEntries(rows.map((r) => [r.key, r.content]));
}

export async function levelInfo(db: Db, editionId: string, code: string) {
  const [r] = await db
    .select({
      code: t.level.code,
      track: t.level.track,
      rank: t.level.rank,
      titleFr: sql<string | null>`${t.levelVersion.book}->>'titre_fr'`,
      titleAr: sql<string | null>`${t.levelVersion.book}->>'titre_ar'`,
    })
    .from(t.levelVersion)
    .innerJoin(t.level, eq(t.level.code, t.levelVersion.levelCode))
    .where(and(eq(t.levelVersion.editionId, editionId), eq(t.level.code, code)));
  return r ?? null;
}
