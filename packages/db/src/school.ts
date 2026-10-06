/**
 * Espace école (lot 13) : liste de classe (profils inscrits par leur parent + élèves « papier »), groupes,
 * devoirs et coches, résultats saisis (classe papier), registre des certificats.
 * TOUTES les fonctions qui lisent des données d'élèves prennent l'identifiant de l'ENSEIGNANT et ne
 * renvoient rien si la classe n'est pas la sienne (protection des données des mineurs).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, like, lt, sql } from 'drizzle-orm';
import { teachesClass } from './acces.js';
import type { Db } from './client.js';
import * as t from './schema.js';

export type ClassRow = typeof t.classGroup.$inferSelect;
export type PupilRow = typeof t.classPupil.$inferSelect;

/**
 * La classe, si ce compte en est enseignant (titulaire, suppléant) ou à la direction de son école (lot F2) ;
 * sinon null.
 */
export async function teacherClass(
  db: Db,
  teacherAccountId: string,
  classId: string,
): Promise<ClassRow | null> {
  const [c] = await db
    .select()
    .from(t.classGroup)
    .where(and(eq(t.classGroup.id, classId), teachesClass(teacherAccountId)));
  return c ?? null;
}

/** L'élève et sa classe, si la classe est accessible à ce compte (même règle) ; sinon null. */
export async function teacherPupil(
  db: Db,
  teacherAccountId: string,
  pupilId: string,
): Promise<{ pupil: PupilRow; cls: ClassRow } | null> {
  const [r] = await db
    .select({ pupil: t.classPupil, cls: t.classGroup })
    .from(t.classPupil)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classPupil.classId))
    .where(and(eq(t.classPupil.id, pupilId), teachesClass(teacherAccountId)));
  return r ?? null;
}

export async function updateClassSettings(
  db: Db,
  classId: string,
  s: Partial<
    Pick<
      ClassRow,
      | 'name'
      | 'levelCode'
      | 'schoolName'
      | 'schoolNameAr'
      | 'place'
      | 'placeAr'
      | 'schoolYear'
      | 'recitationDays'
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
  return (
    db
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
      // lot F2 : les élèves partis restent au registre (archives), hors de la liste de classe
      .where(and(eq(t.classPupil.classId, classId), isNull(t.classPupil.leftAt)))
      .orderBy(asc(t.classPupil.displayName), asc(t.classPupil.id))
  );
}

/** Élèves PARTIS de la classe (registre archivé : notes et copies conservées). */
export async function archivedPupils(db: Db, classId: string) {
  return db
    .select({
      id: t.classPupil.id,
      displayName: t.classPupil.displayName,
      leftAt: t.classPupil.leftAt,
      profileId: t.classPupil.profileId,
    })
    .from(t.classPupil)
    .where(and(eq(t.classPupil.classId, classId), isNotNull(t.classPupil.leftAt)))
    .orderBy(asc(t.classPupil.displayName));
}

/** Inscription datée (lot F2) : ouverte à l'arrivée d'un élève dans une classe. */
export async function openEnrolment(db: Db, classId: string, pupilId: string) {
  const [c] = await db
    .select({ year: t.classGroup.schoolYearId })
    .from(t.classGroup)
    .where(eq(t.classGroup.id, classId));
  const [open] = await db
    .select({ id: t.enrolment.id })
    .from(t.enrolment)
    .where(and(eq(t.enrolment.pupilId, pupilId), eq(t.enrolment.outcome, 'en_cours')));
  if (open) return;
  await db.insert(t.enrolment).values({
    classId,
    pupilId,
    schoolYearId: c?.year ?? null,
    fromDay: new Date().toISOString().slice(0, 10),
  });
}

/** Départ d'un élève (lot F2, revue E8) : la ligne du registre, ses notes et ses copies sont ARCHIVÉES. */
export async function archivePupil(
  db: Db,
  pupilId: string,
  outcome: 'parti' | 'transfere' | 'admis' | 'redouble' = 'parti',
  by: string | null = null,
) {
  const now = new Date();
  await db.update(t.classPupil).set({ leftAt: now }).where(eq(t.classPupil.id, pupilId));
  await db
    .update(t.enrolment)
    .set({ outcome, toDay: now.toISOString().slice(0, 10), decidedBy: by, decidedAt: now })
    .where(and(eq(t.enrolment.pupilId, pupilId), eq(t.enrolment.outcome, 'en_cours')));
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
  await openEnrolment(db, classId, r!.id);
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

/**
 * Retire l'élève de la classe (un profil de l'application quitte aussi la classe). Lot F2 (revue E8) : la ligne
 * n'est plus effacée — elle est ARCHIVÉE avec ses notes, ses copies et son inscription (registre de l'école) ;
 * seule une ligne saisie par erreur, SANS aucune note ni copie ni certificat, est effacée.
 */
export async function removePupil(db: Db, pupil: PupilRow, by: string | null = null) {
  await db.transaction(async (tx) => {
    const d = tx as unknown as Db;
    await tx
      .update(t.certificate)
      .set({ detachedAt: new Date() })
      .where(and(eq(t.certificate.pupilId, pupil.id), isNull(t.certificate.detachedAt)));
    if (pupil.profileId)
      await tx
        .delete(t.classMember)
        .where(
          and(
            eq(t.classMember.classId, pupil.classId),
            eq(t.classMember.profileId, pupil.profileId),
          ),
        );
    const [notes] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t.paperResult)
      .where(eq(t.paperResult.pupilId, pupil.id));
    const [certs] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t.certificate)
      .where(eq(t.certificate.pupilId, pupil.id));
    const copies = pupil.profileId
      ? await tx
          .select({ id: t.examSubmission.id })
          .from(t.examSubmission)
          .innerJoin(t.examSession, eq(t.examSession.id, t.examSubmission.sessionId))
          .where(
            and(
              eq(t.examSubmission.profileId, pupil.profileId),
              eq(t.examSession.classId, pupil.classId),
            ),
          )
          .limit(1)
      : [];
    if (!notes?.n && !certs?.n && !copies.length && !pupil.profileId)
      await tx.delete(t.classPupil).where(eq(t.classPupil.id, pupil.id));
    else await archivePupil(d, pupil.id, 'parti', by);
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
    .where(and(eq(t.classPupil.profileId, profileId), isNull(t.classPupil.leftAt)))
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
    /** école : classe et ligne du registre ; A39 : adulte autonome — profil seulement (null ici) */
    classId: string | null;
    pupilId: string | null;
    profileId?: string | null;
    issuedBy: string;
    subject: string;
    holderName: string;
    mention: string | null;
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
            profileId: c.profileId ?? null,
            issuedBy: c.issuedBy,
            subject: c.subject,
            holderName: c.holderName,
            mention: c.mention,
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
      holderName: t.certificate.holderName,
      mention: t.certificate.mention,
      issuedAt: t.certificate.issuedAt,
    })
    .from(t.certificate)
    .where(eq(t.certificate.classId, classId))
    .orderBy(asc(t.certificate.number));
}

/** Un certificat, pour l'enseignant qui l'a délivré ou un enseignant (ou la direction) de la classe. */
export async function teacherCertificate(db: Db, teacherAccountId: string, id: string) {
  const [c] = await db.select().from(t.certificate).where(eq(t.certificate.id, id));
  if (!c) return null;
  if (c.issuedBy === teacherAccountId) return c;
  // lot F2 : enseignant (titulaire, suppléant) ou direction de la classe du certificat
  return c.classId && (await teacherClass(db, teacherAccountId, c.classId)) ? c : null;
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

/**
 * Registre des certificats (décision du pilote du 29/09/2026, À CONFIRMER PAR LE JURISTE) : numéro, nom affiché,
 * niveau ou passage, date et mention sont conservés durablement (preuve d'un diplôme) ; le document complet
 * (autres données de l'élève : nom arabe, date de naissance saisie…) est réduit au registre 30 jours après
 * le départ de l'élève de la classe (ou la disparition de la classe).
 */
export async function purgeCertificateDocuments(
  db: Db,
  days = 30,
  now = new Date(),
): Promise<number> {
  // départ non daté (classe supprimée avec le compte de l'enseignant) : daté maintenant
  await db
    .update(t.certificate)
    .set({ detachedAt: now })
    .where(and(isNull(t.certificate.pupilId), isNull(t.certificate.detachedAt)));
  const limit = new Date(now.getTime() - days * 86400_000);
  const due = await db
    .select({
      id: t.certificate.id,
      number: t.certificate.number,
      kind: t.certificate.kind,
      subject: t.certificate.subject,
      holderName: t.certificate.holderName,
      mention: t.certificate.mention,
      issuedAt: t.certificate.issuedAt,
      document: t.certificate.document,
    })
    .from(t.certificate)
    .where(lt(t.certificate.detachedAt, limit));
  let n = 0;
  for (const c of due) {
    if ((c.document as { reduit?: boolean }).reduit) continue;
    await db
      .update(t.certificate)
      .set({
        document: {
          reduit: true,
          number: c.number,
          kind: c.kind,
          subject: c.subject,
          holderName: c.holderName,
          mention: c.mention,
          issuedOn: c.issuedAt.toISOString().slice(0, 10),
        },
      })
      .where(eq(t.certificate.id, c.id));
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- certificats vérifiables (lot 20)

/** Pose le code de vérification et la signature d'un certificat (une seule fois). */
export async function sealCertificate(
  db: Db,
  id: string,
  s: { verifCode: string; signature: string | null; keyId: string | null },
) {
  const [r] = await db
    .update(t.certificate)
    .set(s)
    .where(and(eq(t.certificate.id, id), isNull(t.certificate.verifCode)))
    .returning();
  return r ?? null;
}

/** Certificat par numéro ET code de vérification (vérification publique), sinon null. */
export async function certificateByNumberAndCode(db: Db, number: string, code: string) {
  const [r] = await db
    .select()
    .from(t.certificate)
    .where(and(eq(t.certificate.number, number), eq(t.certificate.verifCode, code)));
  return r ?? null;
}

export async function revokeCertificate(db: Db, id: string, reason: string) {
  const [r] = await db
    .update(t.certificate)
    .set({ revokedAt: new Date(), revokeReason: reason })
    .where(and(eq(t.certificate.id, id), isNull(t.certificate.revokedAt)))
    .returning({ id: t.certificate.id });
  return !!r;
}
