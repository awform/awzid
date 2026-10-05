/**
 * Signalements d'erreurs dans le CONTENU et suspensions d'urgence (lot F1, revue d'architecture M1).
 *  - un compte connecté signale un verset, un hadith, une règle de fiqh, une leçon ou un exercice : motif,
 *    commentaire court, extrait affiché ; limitation anti-abus (10 par 24 h, un seul par bloc et par jour) ;
 *  - le référent (rôle « referent ») ou l'administrateur traite la file : reçu → en examen → corrigé (erratum
 *    public, édition qui corrige) ou rejeté (motif obligatoire) ; l'auteur n'est jamais montré ;
 *  - l'administrateur peut SUSPENDRE d'urgence une leçon, un exercice ou un bloc (masqué partout), puis lever.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export const REPORT_KINDS = ['verset', 'hadith', 'fiqh', 'lecon', 'exercice'] as const;
export const REPORT_REASONS = [
  'texte_arabe',
  'sens',
  'reference',
  'regle',
  'corrige',
  'orthographe',
  'autre',
] as const;
export const REPORT_STATUSES = ['recu', 'en_examen', 'corrige', 'rejete'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Limites anti-abus : par compte et par 24 h. */
export const REPORT_LIMITS = { perDay: 10 } as const;

export interface ReportInput {
  accountId: string;
  editionId: string | null;
  targetKind: (typeof REPORT_KINDS)[number];
  unitId: string | null;
  path: string;
  ref?: string | null;
  excerpt?: string | null;
  fp?: string | null;
  reason: (typeof REPORT_REASONS)[number];
  comment?: string | null;
}

export type ReportOutcome =
  | { ok: true; id: string }
  | { ok: false; code: 'trop_de_signalements' | 'deja_signale' | 'lecon_inconnue' };

const clip = (s: string | null | undefined, n: number) => {
  const v = (s ?? '').trim();
  return v ? v.slice(0, n) : null;
};

export async function createReport(db: Db, r: ReportInput): Promise<ReportOutcome> {
  const since = new Date(Date.now() - 86_400_000);
  const recent = await db
    .select({ unitId: t.contentReport.unitId, path: t.contentReport.path })
    .from(t.contentReport)
    .where(and(eq(t.contentReport.accountId, r.accountId), gte(t.contentReport.createdAt, since)));
  if (recent.some((x) => x.unitId === r.unitId && x.path === r.path))
    return { ok: false, code: 'deja_signale' };
  if (recent.length >= REPORT_LIMITS.perDay) return { ok: false, code: 'trop_de_signalements' };
  if (r.unitId) {
    const [u] = await db.select({ id: t.unit.id }).from(t.unit).where(eq(t.unit.id, r.unitId));
    if (!u) return { ok: false, code: 'lecon_inconnue' };
  }
  const [row] = await db
    .insert(t.contentReport)
    .values({
      accountId: r.accountId,
      editionId: r.editionId,
      targetKind: r.targetKind,
      unitId: r.unitId,
      path: r.path,
      ref: clip(r.ref, 120),
      excerpt: clip(r.excerpt, 300),
      fp: clip(r.fp, 16),
      reason: r.reason,
      comment: clip(r.comment, 500),
    })
    .returning({ id: t.contentReport.id });
  return { ok: true, id: row!.id };
}

/** File de traitement (référent, administrateur) : JAMAIS le compte de l'auteur. */
export async function reportQueue(db: Db, statuses: readonly ReportStatus[], limit = 100) {
  return db
    .select({
      id: t.contentReport.id,
      createdAt: t.contentReport.createdAt,
      targetKind: t.contentReport.targetKind,
      unitId: t.contentReport.unitId,
      path: t.contentReport.path,
      ref: t.contentReport.ref,
      excerpt: t.contentReport.excerpt,
      fp: t.contentReport.fp,
      reason: t.contentReport.reason,
      comment: t.contentReport.comment,
      status: t.contentReport.status,
      decisionNote: t.contentReport.decisionNote,
      erratum: t.contentReport.erratum,
      fixedInEdition: t.contentReport.fixedInEdition,
      handledAt: t.contentReport.handledAt,
      edition: t.edition.code,
    })
    .from(t.contentReport)
    .leftJoin(t.edition, eq(t.edition.id, t.contentReport.editionId))
    .where(inArray(t.contentReport.status, [...statuses]))
    .orderBy(desc(t.contentReport.createdAt))
    .limit(limit);
}

export async function reportById(db: Db, id: string) {
  const [r] = await db.select().from(t.contentReport).where(eq(t.contentReport.id, id));
  return r ?? null;
}

/** Transitions admises : reçu → en examen → corrigé | rejeté ; reçu → rejeté (doublon, hors sujet). */
const NEXT: Record<ReportStatus, readonly ReportStatus[]> = {
  recu: ['en_examen', 'rejete', 'corrige'],
  en_examen: ['corrige', 'rejete'],
  corrige: [],
  rejete: [],
};

export type DecisionOutcome =
  | { ok: true }
  | { ok: false; code: 'introuvable' | 'transition_interdite' | 'motif_requis' | 'erratum_requis' };

export async function decideReport(
  db: Db,
  id: string,
  by: string,
  d: { status: ReportStatus; decisionNote?: string; erratum?: string; fixedInEdition?: string },
): Promise<DecisionOutcome> {
  const cur = await reportById(db, id);
  if (!cur) return { ok: false, code: 'introuvable' };
  if (!NEXT[cur.status as ReportStatus]?.includes(d.status))
    return { ok: false, code: 'transition_interdite' };
  if (d.status === 'rejete' && !clip(d.decisionNote, 1000))
    return { ok: false, code: 'motif_requis' };
  if (d.status === 'corrige' && !clip(d.erratum, 600)) return { ok: false, code: 'erratum_requis' };
  await db
    .update(t.contentReport)
    .set({
      status: d.status,
      decisionNote: clip(d.decisionNote, 1000) ?? cur.decisionNote,
      erratum: clip(d.erratum, 600) ?? cur.erratum,
      fixedInEdition: clip(d.fixedInEdition, 60) ?? cur.fixedInEdition,
      handledBy: by,
      handledAt: new Date(),
    })
    .where(eq(t.contentReport.id, id));
  return { ok: true };
}

/** Errata publics : corrections faites à la suite d'un signalement (ni auteur, ni commentaire). */
export async function publicErrata(db: Db, limit = 200) {
  return db
    .select({
      id: t.contentReport.id,
      targetKind: t.contentReport.targetKind,
      unitId: t.contentReport.unitId,
      ref: t.contentReport.ref,
      erratum: t.contentReport.erratum,
      fixedInEdition: t.contentReport.fixedInEdition,
      date: t.contentReport.handledAt,
    })
    .from(t.contentReport)
    .where(eq(t.contentReport.status, 'corrige'))
    .orderBy(desc(t.contentReport.handledAt))
    .limit(limit);
}

// ------------------------------------------------------------------ suspensions

export interface ActiveSuspension {
  id: string;
  unitId: string;
  path: string;
  fp: string | null;
}

export async function activeSuspensions(db: Db): Promise<ActiveSuspension[]> {
  return db
    .select({
      id: t.contentSuspension.id,
      unitId: t.contentSuspension.unitId,
      path: t.contentSuspension.path,
      fp: t.contentSuspension.fp,
    })
    .from(t.contentSuspension)
    .where(isNull(t.contentSuspension.liftedAt))
    .orderBy(t.contentSuspension.createdAt);
}

/** Liste détaillée pour l'administrateur (motif interne compris). */
export async function suspensionList(db: Db) {
  return db
    .select({
      id: t.contentSuspension.id,
      unitId: t.contentSuspension.unitId,
      path: t.contentSuspension.path,
      reason: t.contentSuspension.reason,
      reportId: t.contentSuspension.reportId,
      createdAt: t.contentSuspension.createdAt,
    })
    .from(t.contentSuspension)
    .where(isNull(t.contentSuspension.liftedAt))
    .orderBy(desc(t.contentSuspension.createdAt));
}

export async function suspend(
  db: Db,
  s: {
    unitId: string;
    path: string;
    fp: string | null;
    reason: string;
    reportId?: string | null;
    by: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; code: 'deja_suspendu' }> {
  const rows = await db
    .insert(t.contentSuspension)
    .values({
      unitId: s.unitId,
      path: s.path,
      fp: s.fp,
      reason: s.reason.slice(0, 500),
      reportId: s.reportId ?? null,
      createdBy: s.by,
    })
    .onConflictDoNothing()
    .returning({ id: t.contentSuspension.id });
  return rows[0] ? { ok: true, id: rows[0].id } : { ok: false, code: 'deja_suspendu' };
}

export async function liftSuspension(db: Db, id: string, by: string): Promise<boolean> {
  const r = await db
    .update(t.contentSuspension)
    .set({ liftedAt: new Date(), liftedBy: by })
    .where(and(eq(t.contentSuspension.id, id), isNull(t.contentSuspension.liftedAt)))
    .returning({ id: t.contentSuspension.id });
  return r.length > 0;
}

/** Marque de version des suspensions (clé du cache des paquets hors ligne). */
export async function suspensionsVersion(db: Db): Promise<string> {
  const r = await db.execute<{ v: string | null }>(
    sql`SELECT max(greatest(created_at, coalesce(lifted_at, created_at)))::text || ':' || count(*) FILTER (WHERE lifted_at IS NULL) AS v FROM content_suspension`,
  );
  return r.rows[0]?.v ?? '0';
}

// ------------------------------------------------------------------ rôles

export async function hasRole(db: Db, accountId: string, role: 'referent'): Promise<boolean> {
  const [r] = await db
    .select({ a: t.accountRole.accountId })
    .from(t.accountRole)
    .where(and(eq(t.accountRole.accountId, accountId), eq(t.accountRole.role, role)));
  return !!r;
}

export async function grantRole(db: Db, accountId: string, role: 'referent'): Promise<void> {
  await db.insert(t.accountRole).values({ accountId, role }).onConflictDoNothing();
}
