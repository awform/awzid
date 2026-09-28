/** Lectures du contenu utilisées par l'API (projection élève uniquement). */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export interface EditionRow {
  id: string;
  code: string;
  status: string;
}

/** Édition servie : celle dont le code est donné, sinon l'édition publiée. */
export async function currentEdition(db: Db, code?: string): Promise<EditionRow | null> {
  const rows = await db
    .select({ id: t.edition.id, code: t.edition.code, status: t.edition.status })
    .from(t.edition)
    .where(code ? eq(t.edition.code, code) : eq(t.edition.status, 'publiee'))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLevels(db: Db, editionId: string) {
  return db
    .select({
      code: t.level.code,
      track: t.level.track,
      rank: t.level.rank,
      titleFr: t.level.titleFr,
      codeFr: sql<string | null>`${t.levelVersion.book}->>'code_fr'`,
      niveauFr: sql<string | null>`${t.levelVersion.book}->>'niveau_fr'`,
      titreAr: sql<string | null>`${t.levelVersion.book}->>'titre_ar'`,
      units: sql<number>`(select count(*)::int from ${t.unitVersion} uv join ${t.unit} u on u.id = uv.unit_id
               where uv.edition_id = ${t.levelVersion.editionId} and u.level_code = ${t.level.code})`,
    })
    .from(t.levelVersion)
    .innerJoin(t.level, eq(t.level.code, t.levelVersion.levelCode))
    .where(eq(t.levelVersion.editionId, editionId))
    .orderBy(asc(t.level.track), asc(t.level.rank));
}

export async function listUnits(db: Db, editionId: string, levelCode: string) {
  return db
    .select({
      id: t.unit.id,
      n: t.unit.n,
      kind: t.unit.kind,
      numLecon: t.unitVersion.numLecon,
      numBilan: t.unitVersion.numBilan,
      titleAr: t.unitVersion.titleAr,
      titleFr: t.unitVersion.titleFr,
      sha256: t.unitVersion.sha256,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(and(eq(t.unitVersion.editionId, editionId), eq(t.unit.levelCode, levelCode)))
    .orderBy(asc(t.unit.n));
}

/** Leçon en projection ÉLÈVE (jamais le guide ni la translittération) + identifiants d'exercices. */
export async function getUnitForStudent(db: Db, editionId: string, unitId: string) {
  const rows = await db
    .select({
      id: t.unit.id,
      levelCode: t.unit.levelCode,
      n: t.unit.n,
      kind: t.unit.kind,
      numLecon: t.unitVersion.numLecon,
      numBilan: t.unitVersion.numBilan,
      titleAr: t.unitVersion.titleAr,
      titleFr: t.unitVersion.titleFr,
      sha256: t.unitVersion.sha256,
      lesson: t.unitVersion.student,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(and(eq(t.unitVersion.editionId, editionId), eq(t.unitVersion.unitId, unitId)))
    .limit(1);
  const unit = rows[0];
  if (!unit) return null;
  const exercises = await db
    .select({
      id: t.exercise.id,
      position: t.exercise.position,
      type: t.exercise.type,
      hash: t.exerciseVersion.hash,
    })
    .from(t.exerciseVersion)
    .innerJoin(t.exercise, eq(t.exercise.id, t.exerciseVersion.exerciseId))
    .where(and(eq(t.exerciseVersion.editionId, editionId), eq(t.exercise.unitId, unitId)))
    .orderBy(asc(t.exercise.position));
  return { ...unit, exercises };
}

export async function ping(db: Db): Promise<boolean> {
  const r = await db.execute(sql`select 1 as ok`);
  return r.rows.length === 1;
}
