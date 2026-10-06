/**
 * A39 « mode serein » (décision du client, 06/10/2026) : l'évaluation ne doit jamais décourager.
 *  - façon d'avancer d'un élève (`eval_mode`, historisée) : « verification », « douce », « serein » ;
 *  - qui décide : l'adulte autonome pour lui-même (« soi ») ; le PARENT pour un enfant ou un ado (l'ado exprime
 *    une préférence que le parent valide) ; l'ENSEIGNANT pour sa classe (s'applique aux mineurs de la classe ;
 *    le choix du parent vaut hors classe) ;
 *  - garde-fou pédagogique dans TOUS les modes : notions FRAGILES (leçons du niveau où l'élève a des erreurs
 *    qu'il n'a pas revues), recommandées avant d'ouvrir le niveau suivant — jamais bloquant en mode serein ;
 *  - encouragements (leçons terminées cette semaine) ; essais d'épreuve réussis (certificat possible).
 */
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export type EvalMode = t.EvalModeName;
export type Decider = 'soi' | 'parent' | 'enseignant' | 'defaut';

export const isEvalMode = (m: unknown): m is EvalMode =>
  typeof m === 'string' && (t.EVAL_MODES as readonly string[]).includes(m);

/** Défaut : « avec vérification » pour l'adulte (comportement d'avant A39), « douce » pour les mineurs. */
export const defaultEvalMode = (kind: string): EvalMode =>
  kind === 'adulte' ? 'verification' : 'douce';

/** Modes proposés : l'adulte choisit entre vérification et serein ; pour un mineur, les trois. */
export const evalModesFor = (kind: string): EvalMode[] =>
  kind === 'adulte' ? ['verification', 'serein'] : ['douce', 'serein', 'verification'];

/** Erreurs non revues à partir desquelles une leçon est une notion FRAGILE. */
export const FRAGILE_MIN = 2;
/** Notions recommandées au plus avant d'ouvrir le niveau suivant. */
export const FRAGILE_MAX = 3;

/** Choix courant (ligne ouverte) d'un profil. */
export async function profileEvalMode(db: Db, profileId: string) {
  const [r] = await db
    .select({ mode: t.evalMode.mode, decider: t.evalMode.decider, since: t.evalMode.since })
    .from(t.evalMode)
    .where(and(eq(t.evalMode.profileId, profileId), isNull(t.evalMode.until)));
  return r && isEvalMode(r.mode) ? { mode: r.mode, decider: r.decider, since: r.since } : null;
}

/** Mode décidé par l'enseignant pour une classe (null : choix laissé aux familles). */
export async function classEvalMode(db: Db, classId: string): Promise<EvalMode | null> {
  const [r] = await db
    .select({ mode: t.evalMode.mode })
    .from(t.evalMode)
    .where(and(eq(t.evalMode.classId, classId), isNull(t.evalMode.until)));
  return r && isEvalMode(r.mode) ? r.mode : null;
}

/**
 * Classe ACTIVE de l'élève dont l'enseignant a fixé le mode (inscrit par sa famille ou par l'école), pour la
 * matière demandée (classe sans matière : toutes) ; la décision la plus récente l'emporte.
 */
export async function classModeOf(db: Db, profileId: string, subject: string) {
  const rows = await db
    .select({
      id: t.classGroup.id,
      name: t.classGroup.name,
      subject: t.classGroup.subjectCode,
      mode: t.evalMode.mode,
    })
    .from(t.evalMode)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.evalMode.classId))
    .where(
      and(
        isNull(t.evalMode.until),
        eq(t.classGroup.status, 'active'),
        sql`${t.evalMode.mode} IS NOT NULL`,
        sql`(EXISTS (SELECT 1 FROM "class_member" cm WHERE cm."class_id" = ${t.classGroup.id} AND cm."profile_id" = ${profileId}::uuid)
          OR EXISTS (SELECT 1 FROM "class_pupil" cp WHERE cp."class_id" = ${t.classGroup.id} AND cp."profile_id" = ${profileId}::uuid AND cp."left_at" IS NULL))`,
      ),
    )
    .orderBy(desc(t.evalMode.since));
  const r = rows.find((x) => !x.subject || x.subject === subject);
  return r && isEvalMode(r.mode) ? { id: r.id, name: r.name, mode: r.mode } : null;
}

export interface EffectiveMode {
  mode: EvalMode;
  decideur: Decider;
  /** classe dont l'enseignant décide (mineurs seulement) */
  classe: { id: string; name: string } | null;
  /** choix de la famille (ou de l'adulte), qui vaut hors classe */
  famille: EvalMode | null;
}

/** Mode qui s'applique à un élève pour une matière : classe (mineur), puis choix du profil, puis défaut. */
export async function effectiveEvalMode(
  db: Db,
  profileId: string,
  subject = 'arabe',
): Promise<EffectiveMode | null> {
  const [p] = await db
    .select({ kind: t.profile.kind })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  if (!p) return null;
  const own = await profileEvalMode(db, profileId);
  const famille = own?.mode ?? null;
  if (p.kind !== 'adulte') {
    const c = await classModeOf(db, profileId, subject);
    if (c)
      return { mode: c.mode, decideur: 'enseignant', classe: { id: c.id, name: c.name }, famille };
  }
  if (own) return { mode: own.mode, decideur: own.decider as Decider, classe: null, famille };
  return { mode: defaultEvalMode(p.kind), decideur: 'defaut', classe: null, famille };
}

/** Nouveau choix pour un profil (l'ancien est fermé, l'historique reste) ; la préférence de l'ado est effacée. */
export async function setProfileEvalMode(
  db: Db,
  profileId: string,
  mode: EvalMode,
  decider: 'soi' | 'parent',
  by: string | null,
) {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(t.evalMode)
      .set({ until: now })
      .where(and(eq(t.evalMode.profileId, profileId), isNull(t.evalMode.until)));
    await tx.insert(t.evalMode).values({ profileId, mode, decider, decidedBy: by, since: now });
    await tx
      .update(t.profile)
      .set({ evalModeWish: null, evalModeWishAt: null })
      .where(eq(t.profile.id, profileId));
  });
}

/** Décision de l'enseignant pour sa classe (null : il laisse le choix aux familles). */
export async function setClassEvalMode(
  db: Db,
  classId: string,
  mode: EvalMode | null,
  by: string | null,
) {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(t.evalMode)
      .set({ until: now })
      .where(and(eq(t.evalMode.classId, classId), isNull(t.evalMode.until)));
    await tx
      .insert(t.evalMode)
      .values({ classId, mode, decider: 'enseignant', decidedBy: by, since: now });
  });
}

/** Historique des choix (profil ou classe), du plus ancien au plus récent. */
export async function evalModeHistory(db: Db, target: { profileId?: string; classId?: string }) {
  return db
    .select({
      mode: t.evalMode.mode,
      decideur: t.evalMode.decider,
      depuis: t.evalMode.since,
      jusqua: t.evalMode.until,
    })
    .from(t.evalMode)
    .where(
      target.profileId
        ? eq(t.evalMode.profileId, target.profileId)
        : eq(t.evalMode.classId, target.classId ?? '00000000-0000-0000-0000-000000000000'),
    )
    .orderBy(asc(t.evalMode.since));
}

/** Préférence de l'ado (null : effacée, quand le parent la refuse). */
export async function setEvalModeWish(db: Db, profileId: string, mode: EvalMode | null) {
  await db
    .update(t.profile)
    .set({ evalModeWish: mode, evalModeWishAt: mode ? new Date() : null })
    .where(eq(t.profile.id, profileId));
}

// ---------------------------------------------------------------- garde-fou : notions fragiles

export interface FragileNotion {
  unitId: string;
  n: number;
  numLecon: number | null;
  titleFr: string;
  titleAr: string;
  /** items dont la DERNIÈRE réponse est encore fausse (erreur non revue) */
  erreurs: number;
}

/**
 * Notions fragiles d'un niveau : leçons (hors épreuve et hors « Pour aller plus loin ») où l'élève a au moins
 * FRAGILE_MIN items dont la dernière réponse est fausse — une erreur refaite juste ne compte plus (revue).
 * Les plus fragiles d'abord.
 */
export async function fragileNotions(
  db: Db,
  editionId: string,
  profileId: string,
  levelCode: string,
): Promise<FragileNotion[]> {
  const units = await db
    .select({
      id: t.unit.id,
      n: t.unit.n,
      numLecon: t.unitVersion.numLecon,
      titleFr: t.unitVersion.titleFr,
      titleAr: t.unitVersion.titleAr,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(
      and(
        eq(t.unitVersion.editionId, editionId),
        eq(t.unit.levelCode, levelCode),
        sql`${t.unit.kind} <> 'examen'`,
        eq(t.unitVersion.facultatif, false),
      ),
    )
    .orderBy(asc(t.unit.n));
  if (!units.length) return [];
  // dernière réponse de chaque item (exercice × item), par leçon
  const rows = await db
    .selectDistinctOn([t.attempt.unitId, t.attempt.exerciseId, t.attempt.itemIndex], {
      unitId: t.attempt.unitId,
      correct: t.attempt.correct,
    })
    .from(t.attempt)
    .where(
      and(
        eq(t.attempt.profileId, profileId),
        eq(t.attempt.eventType, 'reponse'),
        sql`${t.attempt.exerciseId} IS NOT NULL`,
        inArray(
          t.attempt.unitId,
          units.map((u) => u.id),
        ),
      ),
    )
    .orderBy(
      t.attempt.unitId,
      t.attempt.exerciseId,
      t.attempt.itemIndex,
      desc(t.attempt.deviceAt),
      desc(t.attempt.serverAt),
    );
  const wrong = new Map<string, number>();
  for (const r of rows) if (r.correct === 0) wrong.set(r.unitId, (wrong.get(r.unitId) ?? 0) + 1);
  return units
    .map((u) => ({
      unitId: u.id,
      n: u.n,
      numLecon: u.numLecon,
      titleFr: u.titleFr,
      titleAr: u.titleAr,
      erreurs: wrong.get(u.id) ?? 0,
    }))
    .filter((u) => u.erreurs >= FRAGILE_MIN)
    .sort((a, b) => b.erreurs - a.erreurs || a.n - b.n);
}

/** Leçons terminées depuis `since` (encouragement « Tu as terminé N leçons cette semaine »). */
export async function lessonsDoneSince(db: Db, profileId: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.progress)
    .innerJoin(t.unit, eq(t.unit.id, t.progress.unitId))
    .where(
      and(
        eq(t.progress.profileId, profileId),
        inArray(t.progress.status, ['terminee', 'maitrisee']),
        sql`${t.unit.kind} <> 'examen'`,
        gte(t.progress.updatedAt, since),
      ),
    );
  return r?.n ?? 0;
}

/** Lundi 00:00 (UTC) de la semaine en cours. */
export function mondayUtc(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/** Niveaux dont l'élève a RÉUSSI l'épreuve (seule voie vers un certificat, dans tous les modes). */
export async function levelsWithPassedExam(
  db: Db,
  profileId: string,
  subject: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ levelCode: t.placementAttempt.levelCode })
    .from(t.placementAttempt)
    .where(
      and(
        eq(t.placementAttempt.profileId, profileId),
        eq(t.placementAttempt.subjectCode, subject),
        eq(t.placementAttempt.kind, 'epreuve'),
        eq(t.placementAttempt.passed, true),
      ),
    );
  return rows.map((r) => r.levelCode);
}
