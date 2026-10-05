/**
 * Accès du personnel aux classes (lot F2, revue E1) — UNE règle pour toutes les routes de l'espace école :
 * un compte voit une classe s'il en est enseignant (titulaire ou suppléant, `class_teacher`) ou s'il est à la
 * DIRECTION de l'école de la classe (`school_member`). Remplace l'ancien `class_group.teacher_account_id = moi`.
 */
import { sql, type SQL } from 'drizzle-orm';

/**
 * Condition SQL (dans un WHERE d'une requête dont le FROM ou une jointure porte `class_group`) : la classe est
 * accessible à ce compte. Colonnes écrites en entier (`"class_group"."id"`) : un nom nu serait résolu dans la
 * sous-requête (`ct`, `sm`) et rendrait la condition toujours vraie.
 */
export function teachesClass(accountId: string): SQL {
  return sql`(EXISTS (SELECT 1 FROM "class_teacher" ct WHERE ct."class_id" = "class_group"."id" AND ct."account_id" = ${accountId}::uuid)
    OR EXISTS (SELECT 1 FROM "school_member" sm WHERE sm."school_id" = "class_group"."school_id" AND sm."account_id" = ${accountId}::uuid AND sm."role" = 'direction'))`;
}
