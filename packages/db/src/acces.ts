/**
 * Accès du personnel aux classes (lot F2, revue E1) — UNE règle pour toutes les routes de l'espace école :
 * un compte voit une classe s'il en est enseignant (titulaire ou suppléant, `class_teacher`) ou s'il est à la
 * DIRECTION de l'école de la classe (`school_member`). Remplace l'ancien `class_group.teacher_account_id = moi`.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import * as t from './schema.js';

/** Condition SQL : la classe (colonnes de `class_group` de la requête) est accessible à ce compte. */
export function teachesClass(accountId: string): SQL {
  return sql`(EXISTS (SELECT 1 FROM "class_teacher" ct WHERE ct."class_id" = ${t.classGroup.id} AND ct."account_id" = ${accountId}::uuid)
    OR EXISTS (SELECT 1 FROM "school_member" sm WHERE sm."school_id" = ${t.classGroup.schoolId} AND sm."account_id" = ${accountId}::uuid AND sm."role" = 'direction'))`;
}

/** Même règle, à partir d'une colonne contenant l'identifiant de la classe (sans jointure sur class_group). */
export function teachesClassId(accountId: string, classIdCol: SQL | AnyColumn): SQL {
  return sql`(EXISTS (SELECT 1 FROM "class_teacher" ct WHERE ct."class_id" = ${classIdCol} AND ct."account_id" = ${accountId}::uuid)
    OR EXISTS (SELECT 1 FROM "class_group" cg JOIN "school_member" sm ON sm."school_id" = cg."school_id"
      WHERE cg."id" = ${classIdCol} AND sm."account_id" = ${accountId}::uuid AND sm."role" = 'direction'))`;
}
