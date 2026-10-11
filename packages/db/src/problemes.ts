/**
 * Bêta-support — « Signaler un problème » : données des signalements (catégorie, description courte, capture
 * facultative, page d'origine, version), limites anti-abus, file de l'administrateur avec statut, purge.
 * Distinct de « Donner mon avis » (F5, `fonctions.ts`) : un avis est une opinion, un signalement est une
 * anomalie à traiter (nouveau → en cours → réglé).
 */
import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import * as t from './schema.js';
import type { Db } from './client.js';

export const PROBLEM_CATEGORIES = ['bug', 'contenu', 'religieux', 'autre'] as const;
export const PROBLEM_STATUS = ['nouveau', 'en_cours', 'regle'] as const;
/** limites anti-abus : par compte et par jour ; pour toute la plateforme et par heure */
export const PROBLEM_PER_DAY = 5;
export const PROBLEM_PER_HOUR_ALL = 200;
export const PROBLEM_CAPTURE_MAX = 400 * 1024;
export const PROBLEM_BODY_MAX = 500;

export async function problemRecent(
  db: Db,
  accountId: string,
  now = new Date(),
): Promise<{ compte: number; tous: number }> {
  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.problemReport)
    .where(
      and(
        eq(t.problemReport.accountId, accountId),
        gte(t.problemReport.createdAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  const [b] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.problemReport)
    .where(gte(t.problemReport.createdAt, new Date(now.getTime() - 3_600_000)));
  return { compte: a?.n ?? 0, tous: b?.n ?? 0 };
}

export async function insertProblem(
  db: Db,
  v: typeof t.problemReport.$inferInsert,
): Promise<string> {
  const [r] = await db.insert(t.problemReport).values(v).returning({ id: t.problemReport.id });
  return r!.id;
}

export async function listProblems(db: Db, status: string | null, limit = 100) {
  return db
    .select({
      id: t.problemReport.id,
      role: t.problemReport.role,
      age: t.problemReport.age,
      categorie: t.problemReport.category,
      texte: t.problemReport.body,
      page: t.problemReport.page,
      version: t.problemReport.appVersion,
      capture: sql<boolean>`${t.problemReport.capture} IS NOT NULL`,
      statut: t.problemReport.status,
      creeLe: t.problemReport.createdAt,
      traiteLe: t.problemReport.handledAt,
    })
    .from(t.problemReport)
    .where(status ? eq(t.problemReport.status, status) : undefined)
    .orderBy(desc(t.problemReport.createdAt))
    .limit(limit);
}

export async function problemCapture(
  db: Db,
  id: string,
): Promise<{ data: Buffer; type: string } | null> {
  const [r] = await db
    .select({ data: t.problemReport.capture, type: t.problemReport.captureType })
    .from(t.problemReport)
    .where(eq(t.problemReport.id, id));
  return r?.data && r.type ? { data: r.data, type: r.type } : null;
}

export async function setProblemStatus(
  db: Db,
  id: string,
  status: string,
  by: string,
): Promise<boolean> {
  const r = await db
    .update(t.problemReport)
    .set({ status, handledAt: status === 'nouveau' ? null : new Date(), handledBy: by })
    .where(eq(t.problemReport.id, id));
  return (r.rowCount ?? 0) > 0;
}

/** Captures de plus de 90 jours effacées ; signalements RÉGLÉS de plus de 12 mois supprimés. */
export async function purgeProblemes(
  db: Db,
  now = new Date(),
): Promise<{ captures: number; regles: number }> {
  const captures =
    (
      await db
        .update(t.problemReport)
        .set({ capture: null, captureType: null })
        .where(
          and(
            isNotNull(t.problemReport.captureType),
            lt(t.problemReport.createdAt, new Date(now.getTime() - 90 * 86_400_000)),
          ),
        )
    ).rowCount ?? 0;
  const regles =
    (
      await db
        .delete(t.problemReport)
        .where(
          and(
            eq(t.problemReport.status, 'regle'),
            lt(t.problemReport.createdAt, new Date(now.getTime() - 365 * 86_400_000)),
          ),
        )
    ).rowCount ?? 0;
  return { captures, regles };
}
