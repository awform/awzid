/**
 * Hifẓ (lot 5) : texte coranique de référence (Tanzil, lecture seule), carnets, plans, journal immuable
 * des événements, classes (l'enseignant ne voit que les élèves que le PARENT a inscrits).
 */
import { randomInt } from 'node:crypto';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { deviceTime, hasNul, isInt32, isolated, REFUSED, validDay, validPart } from './bounds.js';
import type { Db } from './client.js';
import * as t from './schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(['appris', 'revision']);
/** sources qu'un appareil de la famille peut déclarer (le maître passe par sa propre route) */
const FAMILY_SOURCES = new Set(['auto', 'parent']);

/** Texte Tanzil complet (s:a → texte), tel qu'importé et contrôlé octet par octet. */
export async function allVerses(db: Db): Promise<Map<string, string>> {
  const rows = await db.select().from(t.quranVerse);
  return new Map(rows.map((r) => [`${r.sura}:${r.aya}`, r.text]));
}

export async function versesOf(
  db: Db,
  sura: number,
  from: number,
  to: number,
): Promise<Array<{ s: number; a: number; text: string }>> {
  const rows = await db
    .select()
    .from(t.quranVerse)
    .where(eq(t.quranVerse.sura, sura))
    .orderBy(asc(t.quranVerse.aya));
  return rows
    .filter((r) => r.aya >= from && r.aya <= to)
    .map((r) => ({ s: r.sura, a: r.aya, text: r.text }));
}

export async function getHifzBook(db: Db, editionId: string, code: string): Promise<unknown> {
  const [b] = await db
    .select({ content: t.hifzBook.content })
    .from(t.hifzBook)
    .where(and(eq(t.hifzBook.editionId, editionId), eq(t.hifzBook.code, code)));
  return b?.content ?? null;
}

export async function listHifzBooks(db: Db, editionId: string): Promise<string[]> {
  const rows = await db
    .select({ code: t.hifzBook.code })
    .from(t.hifzBook)
    .where(eq(t.hifzBook.editionId, editionId));
  return rows.map((r) => r.code).filter((c) => !c.startsWith('_'));
}

// ---------------------------------------------------------------- plans

export type HifzPlanRow = typeof t.hifzPlan.$inferSelect;

export async function getPlan(db: Db, profileId: string): Promise<HifzPlanRow | null> {
  const [p] = await db.select().from(t.hifzPlan).where(eq(t.hifzPlan.profileId, profileId));
  return p ?? null;
}

export interface PlanInput {
  mode: 'carnet' | 'rythme';
  bookCode?: string | null;
  rhythmYears?: number | null;
  cycleDays?: number | null;
  suraOrder?: 'rebours' | 'juz30';
  startDate: string;
  trial?: boolean;
  newFactor?: number;
  reliefUntil?: string | null;
}

export async function savePlan(
  db: Db,
  profileId: string,
  input: PlanInput,
  accountId: string,
): Promise<HifzPlanRow> {
  const values = {
    profileId,
    mode: input.mode,
    bookCode: input.mode === 'carnet' ? (input.bookCode ?? null) : null,
    rhythmYears: input.mode === 'rythme' ? (input.rhythmYears ?? 7) : null,
    cycleDays: input.mode === 'rythme' ? (input.cycleDays ?? null) : null,
    suraOrder: input.suraOrder ?? 'rebours',
    startDate: input.startDate,
    trial: input.mode === 'rythme' ? (input.trial ?? false) : false,
    newFactor: input.newFactor ?? 1,
    reliefUntil: input.reliefUntil ?? null,
    updatedBy: accountId,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(t.hifzPlan)
    .values(values)
    .onConflictDoUpdate({ target: t.hifzPlan.profileId, set: values })
    .returning();
  return row!;
}

// ---------------------------------------------------------------- événements

export interface HifzEventInput {
  id: string;
  profileId: string;
  day: string;
  part: string;
  kind: 'appris' | 'revision';
  q?: number;
  source: string;
  pos?: number;
  details?: unknown;
  deviceAt: string;
}

export interface HifzRecordResult {
  accepted: string[];
  duplicates: string[];
  rejected: Array<{ id: string; reason: string }>;
}

/** Nombre de versets par sourate d'après le texte importé (vide si le Coran n'est pas importé). */
async function ayaCounts(db: Db): Promise<Map<number, number> | undefined> {
  const rows = await db
    .select({ s: t.quranVerse.sura, n: sql<number>`max(${t.quranVerse.aya})::int` })
    .from(t.quranVerse)
    .groupBy(t.quranVerse.sura);
  return rows.length === 114 ? new Map(rows.map((r) => [r.s, r.n])) : undefined;
}

/**
 * Enregistre des événements (idempotent). `teacher` : événements du maître (source « enseignant »),
 * sinon seules les sources de la famille sont acceptées.
 */
export async function recordHifzEvents(
  db: Db,
  events: readonly HifzEventInput[],
  authorAccountId: string,
  teacher = false,
): Promise<HifzRecordResult> {
  const res: HifzRecordResult = { accepted: [], duplicates: [], rejected: [] };
  const ayas = events.length ? await ayaCounts(db) : undefined;
  for (const e of events) {
    const reject = (reason: string) => res.rejected.push({ id: String(e?.id ?? ''), reason });
    if (!e || typeof e.id !== 'string' || !UUID.test(e.id)) {
      reject('identifiant invalide');
      continue;
    }
    if (!UUID.test(String(e.profileId))) {
      reject('profil invalide');
      continue;
    }
    if (!validDay(e.day) || !validPart(e.part, ayas) || !KINDS.has(String(e.kind))) {
      reject('événement invalide');
      continue;
    }
    if (teacher ? e.source !== 'enseignant' : !FAMILY_SOURCES.has(String(e.source))) {
      reject('source non autorisée');
      continue;
    }
    const q = e.q === undefined || e.q === null ? null : Number(e.q);
    if (e.kind === 'revision' && (q === null || !Number.isInteger(q) || q < 0 || q > 3)) {
      reject('résultat invalide');
      continue;
    }
    if (q !== null && (!Number.isInteger(q) || q < 0 || q > 3)) {
      reject('résultat invalide');
      continue;
    }
    if (e.pos !== undefined && e.pos !== null && (!isInt32(e.pos) || e.pos < 0)) {
      reject('position invalide');
      continue;
    }
    if (hasNul(e.details) || JSON.stringify(e.details ?? null).length > 2000) {
      reject('détails invalides');
      continue;
    }
    const deviceAt = deviceTime(e.deviceAt);
    if (!deviceAt) {
      reject('horodatage invalide');
      continue;
    }
    const inserted = await isolated(() =>
      db
        .insert(t.hifzEvent)
        .values({
          id: e.id,
          profileId: e.profileId,
          day: e.day,
          part: e.part,
          kind: e.kind,
          q,
          source: e.source,
          pos: Number.isInteger(e.pos) ? e.pos : null,
          details: e.details ?? null,
          authorAccountId,
          deviceAt,
        })
        .onConflictDoNothing()
        .returning({ id: t.hifzEvent.id }),
    );
    if (inserted === REFUSED) reject('données invalides');
    else if (inserted.length) res.accepted.push(e.id);
    else res.duplicates.push(e.id);
  }
  return res;
}

export async function listHifzEvents(db: Db, profileId: string) {
  return db
    .select({
      id: t.hifzEvent.id,
      day: t.hifzEvent.day,
      part: t.hifzEvent.part,
      kind: t.hifzEvent.kind,
      q: t.hifzEvent.q,
      source: t.hifzEvent.source,
      pos: t.hifzEvent.pos,
      details: t.hifzEvent.details,
    })
    .from(t.hifzEvent)
    .where(eq(t.hifzEvent.profileId, profileId))
    .orderBy(asc(t.hifzEvent.day), asc(t.hifzEvent.id));
}

// ---------------------------------------------------------------- classes

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (confusions)

export function newJoinCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export async function createClass(db: Db, teacherAccountId: string, name: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await db
      .insert(t.classGroup)
      .values({ teacherAccountId, name, joinCode: newJoinCode() })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return rows[0];
  }
  throw new Error('code de classe introuvable');
}

export async function listClasses(db: Db, teacherAccountId: string) {
  return db
    .select()
    .from(t.classGroup)
    .where(eq(t.classGroup.teacherAccountId, teacherAccountId))
    .orderBy(asc(t.classGroup.createdAt));
}

export async function classByCode(db: Db, code: string) {
  const [c] = await db
    .select()
    .from(t.classGroup)
    .where(eq(t.classGroup.joinCode, code.trim().toUpperCase()));
  return c ?? null;
}

export async function classMembers(db: Db, classId: string) {
  return (
    db
      .select({
        id: t.profile.id,
        pseudonym: t.profile.pseudonym,
        avatar: t.profile.avatar,
        kind: t.profile.kind,
        levelCode: t.profile.levelCode,
        joinedAt: t.classMember.joinedAt,
      })
      .from(t.classMember)
      .innerJoin(t.profile, eq(t.profile.id, t.classMember.profileId))
      // audit MIN-5 : jamais un profil dont le compte est en cours d'effacement
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(and(eq(t.classMember.classId, classId), isNull(t.account.deletedAt)))
      .orderBy(asc(t.profile.pseudonym))
  );
}

/** L'enseignant suit-il ce profil (dans une de ses classes) ? */
export async function teacherHasProfile(
  db: Db,
  teacherAccountId: string,
  profileId: string,
): Promise<boolean> {
  const classes = await listClasses(db, teacherAccountId);
  if (!classes.length) return false;
  const [m] = await db
    .select({ p: t.classMember.profileId })
    .from(t.classMember)
    .where(
      and(
        eq(t.classMember.profileId, profileId),
        inArray(
          t.classMember.classId,
          classes.map((c) => c.id),
        ),
      ),
    );
  return !!m;
}

export async function profileClasses(db: Db, profileId: string) {
  return db
    .select({ id: t.classGroup.id, name: t.classGroup.name, joinedAt: t.classMember.joinedAt })
    .from(t.classMember)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
    .where(eq(t.classMember.profileId, profileId));
}

export async function joinClass(db: Db, classId: string, profileId: string, parentId: string) {
  await db
    .insert(t.classMember)
    .values({ classId, profileId, addedBy: parentId })
    .onConflictDoNothing();
  // liste de classe de l'espace école : le pseudonyme du profil (jamais le nom réel)
  const [p] = await db
    .select({ pseudonym: t.profile.pseudonym })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  await db
    .insert(t.classPupil)
    .values({ classId, profileId, displayName: p?.pseudonym ?? '?' })
    .onConflictDoNothing();
}

export async function leaveClass(db: Db, classId: string, profileId: string) {
  const [p] = await db
    .select({ id: t.classPupil.id })
    .from(t.classPupil)
    .where(and(eq(t.classPupil.classId, classId), eq(t.classPupil.profileId, profileId)));
  if (p)
    await db
      .update(t.certificate)
      .set({ detachedAt: new Date() })
      .where(and(eq(t.certificate.pupilId, p.id), isNull(t.certificate.detachedAt)));
  // copies des épreuves de cette classe : effacées au départ de l'élève (lot 19 ; la note reste au registre
  // des certificats si un certificat a été délivré)
  await db
    .delete(t.examSubmission)
    .where(
      and(
        eq(t.examSubmission.profileId, profileId),
        inArray(
          t.examSubmission.sessionId,
          db
            .select({ id: t.examSession.id })
            .from(t.examSession)
            .where(eq(t.examSession.classId, classId)),
        ),
      ),
    );
  // récitations envoyées à cette classe : effacées au départ de l'élève (audit MIN-11)
  await db
    .delete(t.recitationUpload)
    .where(
      and(eq(t.recitationUpload.classId, classId), eq(t.recitationUpload.profileId, profileId)),
    );
  // réponses libres envoyées à cette classe : effacées au départ de l'élève (lot 18)
  await db
    .delete(t.freeAnswer)
    .where(and(eq(t.freeAnswer.classId, classId), eq(t.freeAnswer.profileId, profileId)));
  await db
    .delete(t.classMember)
    .where(and(eq(t.classMember.classId, classId), eq(t.classMember.profileId, profileId)));
  await db
    .delete(t.classPupil)
    .where(and(eq(t.classPupil.classId, classId), eq(t.classPupil.profileId, profileId)));
}

/** Divisions officielles (null si les métadonnées Tanzil n'ont pas été importées). */
export async function quranDivisions(db: Db): Promise<{
  juz: Array<[number, number]>;
  quarters: Array<[number, number]>;
  pages: Array<[number, number]>;
} | null> {
  const rows = await db
    .select()
    .from(t.quranDivision)
    .orderBy(t.quranDivision.kind, t.quranDivision.n);
  if (!rows.length) return null;
  const of = (k: string) =>
    rows.filter((r) => r.kind === k).map((r) => [r.sura, r.aya] as [number, number]);
  return { juz: of('juz'), quarters: of('quart'), pages: of('page') };
}
