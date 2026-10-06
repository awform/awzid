/**
 * Lot F5 « penser large » — données des interrupteurs de fonctions, du canal bêta, des avis et du tableau
 * d'usage sans traceur. La DÉCISION (registre, règles) est dans `@awform/school` (`fonctions.ts`), partagée avec
 * l'application ; ici seulement la lecture et l'écriture en base.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import * as t from './schema.js';
import type { Db } from './client.js';

// ------------------------------------------------------------------ interrupteurs

export interface FlagRule {
  id: string;
  cle: string;
  effet: 'on' | 'off';
  role: string | null;
  age: string | null;
  pays: string | null;
  ecoleId: string | null;
  canal: string | null;
}
export interface FlagsSnapshot {
  etats: Record<string, 'on' | 'off' | 'beta'>;
  regles: FlagRule[];
}

/** Cache COURT (30 s) de la table des interrupteurs : un réglage s'applique partout en moins d'une minute. */
export const FLAGS_TTL_MS = 30_000;
let flagsCache: { at: number; v: FlagsSnapshot } | null = null;
export function invalidateFlags(): void {
  flagsCache = null;
}

export async function readFlags(db: Db, now = Date.now()): Promise<FlagsSnapshot> {
  if (flagsCache && now - flagsCache.at < FLAGS_TTL_MS) return flagsCache.v;
  const etats: FlagsSnapshot['etats'] = {};
  for (const f of await db.select().from(t.featureFlag))
    etats[f.key] = f.state as 'on' | 'off' | 'beta';
  const regles = (await db.select().from(t.featureRule).orderBy(t.featureRule.createdAt)).map(
    (r) => ({
      id: r.id,
      cle: r.key,
      effet: r.effect as 'on' | 'off',
      role: r.role,
      age: r.age,
      pays: r.country,
      ecoleId: r.schoolId,
      canal: r.channel,
    }),
  );
  const v = { etats, regles };
  flagsCache = { at: now, v };
  return v;
}

export async function setFlagState(
  db: Db,
  key: string,
  state: 'on' | 'off' | 'beta',
  by: string | null,
): Promise<void> {
  await db
    .insert(t.featureFlag)
    .values({ key, state, updatedBy: by })
    .onConflictDoUpdate({
      target: t.featureFlag.key,
      set: { state, updatedBy: by, updatedAt: new Date() },
    });
  invalidateFlags();
}

export async function addFlagRule(
  db: Db,
  r: Omit<FlagRule, 'id'>,
  by: string | null,
): Promise<string> {
  const [row] = await db
    .insert(t.featureRule)
    .values({
      key: r.cle,
      effect: r.effet,
      role: r.role || null,
      age: r.age || null,
      country: r.pays ? r.pays.toUpperCase() : null,
      schoolId: r.ecoleId || null,
      channel: r.canal || null,
      createdBy: by,
    })
    .returning({ id: t.featureRule.id });
  invalidateFlags();
  return row!.id;
}

export async function deleteFlagRule(db: Db, id: string): Promise<boolean> {
  const r = await db.delete(t.featureRule).where(eq(t.featureRule.id, id));
  invalidateFlags();
  return (r.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ contexte d'une personne

export interface FlagContextInput {
  accountId: string | null;
  accountKind: string | null;
  roles: readonly string[];
  country: string | null;
  /** profil d'apprenant actif (appartenant au compte : contrôlé par l'appelant) */
  profileId: string | null;
}
export interface FlagContext {
  roles: string[];
  age: 'enfant' | 'ado' | 'adulte' | null;
  pays: string | null;
  ecoles: string[];
  canal: 'beta' | 'production';
}

/**
 * Rôles de la règle (« eleve », « parent », « enseignant », « direction », « admin », « visiteur »), âge (genre du
 * profil actif), pays du compte, écoles (classes du profil, écoles du personnel), canal (bêta si le compte, le
 * profil ou l'une de ces écoles est marqué bêta).
 */
export async function flagContext(db: Db, i: FlagContextInput): Promise<FlagContext> {
  if (!i.accountId)
    return { roles: ['visiteur'], age: null, pays: null, ecoles: [], canal: 'production' };
  const roles = new Set<string>();
  let age: FlagContext['age'] = null;
  if (i.profileId) {
    roles.add('eleve');
    const [p] = await db
      .select({ kind: t.profile.kind })
      .from(t.profile)
      .where(eq(t.profile.id, i.profileId));
    age = (p?.kind as FlagContext['age']) ?? null;
  }
  if (i.accountKind === 'parent' || i.roles.includes('parent')) roles.add('parent');
  if (i.accountKind === 'adulte' && !i.profileId) roles.add('eleve');
  for (const r of ['enseignant', 'direction', 'admin']) if (i.roles.includes(r)) roles.add(r);
  if (i.accountKind === 'enseignant') roles.add('enseignant');
  if (i.accountKind === 'admin') roles.add('admin');
  const ecoles = new Set<string>();
  if (i.profileId)
    for (const r of await db
      .select({ s: t.classGroup.schoolId })
      .from(t.classMember)
      .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
      .where(and(eq(t.classMember.profileId, i.profileId), eq(t.classGroup.status, 'active'))))
      ecoles.add(r.s);
  for (const r of await db
    .select({ s: t.schoolMember.schoolId })
    .from(t.schoolMember)
    .where(eq(t.schoolMember.accountId, i.accountId)))
    ecoles.add(r.s);
  const conds = [eq(t.betaMember.accountId, i.accountId)];
  if (i.profileId) conds.push(eq(t.betaMember.profileId, i.profileId));
  if (ecoles.size) conds.push(inArray(t.betaMember.schoolId, [...ecoles]));
  const beta = await db
    .select({ id: t.betaMember.id })
    .from(t.betaMember)
    .where(or(...conds))
    .limit(1);
  return {
    roles: [...roles],
    age,
    pays: i.country ? i.country.toUpperCase() : null,
    ecoles: [...ecoles],
    canal: beta.length ? 'beta' : 'production',
  };
}

// ------------------------------------------------------------------ canal bêta

export type BetaTarget =
  { type: 'compte'; id: string } | { type: 'profil'; id: string } | { type: 'ecole'; id: string };

export async function setBeta(
  db: Db,
  target: BetaTarget,
  on: boolean,
  by: string | null,
): Promise<void> {
  const col =
    target.type === 'compte'
      ? t.betaMember.accountId
      : target.type === 'profil'
        ? t.betaMember.profileId
        : t.betaMember.schoolId;
  if (!on) {
    await db.delete(t.betaMember).where(eq(col, target.id));
    return;
  }
  await db
    .insert(t.betaMember)
    .values({
      accountId: target.type === 'compte' ? target.id : null,
      profileId: target.type === 'profil' ? target.id : null,
      schoolId: target.type === 'ecole' ? target.id : null,
      addedBy: by,
    })
    .onConflictDoNothing();
}

/** Membres du canal bêta (écoles par leur nom ; comptes et profils comptés, jamais nommés ici). */
export async function listBeta(db: Db): Promise<{
  ecoles: Array<{ id: string; nom: string }>;
  comptes: number;
  profils: number;
}> {
  const ecoles = await db
    .select({ id: t.school.id, nom: t.school.name })
    .from(t.betaMember)
    .innerJoin(t.school, eq(t.school.id, t.betaMember.schoolId))
    .orderBy(t.school.name);
  const [c] = await db
    .select({
      comptes: sql<number>`count(${t.betaMember.accountId})::int`,
      profils: sql<number>`count(${t.betaMember.profileId})::int`,
    })
    .from(t.betaMember);
  return { ecoles, comptes: c?.comptes ?? 0, profils: c?.profils ?? 0 };
}

// ------------------------------------------------------------------ avis

export const FEEDBACK_CATEGORIES = ['idee', 'probleme', 'difficile', 'aime', 'autre'] as const;
export const FEEDBACK_STATUS = ['nouveau', 'lu', 'traite', 'rejete'] as const;
/** limites anti-abus : par compte et par jour ; pour toute la plateforme et par heure */
export const FEEDBACK_PER_DAY = 5;
export const FEEDBACK_PER_HOUR_ALL = 300;
export const FEEDBACK_CAPTURE_MAX = 400 * 1024;

export async function feedbackRecent(
  db: Db,
  accountId: string,
  now = new Date(),
): Promise<{ compte: number; tous: number }> {
  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.feedback)
    .where(
      and(
        eq(t.feedback.accountId, accountId),
        gte(t.feedback.createdAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  const [b] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.feedback)
    .where(gte(t.feedback.createdAt, new Date(now.getTime() - 3_600_000)));
  return { compte: a?.n ?? 0, tous: b?.n ?? 0 };
}

export async function insertFeedback(db: Db, v: typeof t.feedback.$inferInsert): Promise<string> {
  const [r] = await db.insert(t.feedback).values(v).returning({ id: t.feedback.id });
  return r!.id;
}

export async function listFeedback(db: Db, status: string | null, limit = 100) {
  return db
    .select({
      id: t.feedback.id,
      role: t.feedback.role,
      age: t.feedback.age,
      categorie: t.feedback.category,
      texte: t.feedback.body,
      page: t.feedback.page,
      version: t.feedback.appVersion,
      capture: sql<boolean>`${t.feedback.capture} IS NOT NULL`,
      statut: t.feedback.status,
      creeLe: t.feedback.createdAt,
      traiteLe: t.feedback.handledAt,
    })
    .from(t.feedback)
    .where(status ? eq(t.feedback.status, status) : undefined)
    .orderBy(desc(t.feedback.createdAt))
    .limit(limit);
}

export async function feedbackCapture(
  db: Db,
  id: string,
): Promise<{ data: Buffer; type: string } | null> {
  const [r] = await db
    .select({ data: t.feedback.capture, type: t.feedback.captureType })
    .from(t.feedback)
    .where(eq(t.feedback.id, id));
  return r?.data && r.type ? { data: r.data, type: r.type } : null;
}

export async function setFeedbackStatus(
  db: Db,
  id: string,
  status: string,
  by: string,
): Promise<boolean> {
  const r = await db
    .update(t.feedback)
    .set({ status, handledAt: status === 'nouveau' ? null : new Date(), handledBy: by })
    .where(eq(t.feedback.id, id));
  return (r.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ usage sans traceur

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

async function saltOf(db: Db, day: string): Promise<string> {
  await db
    .insert(t.usageSalt)
    .values({ day, salt: randomBytes(32).toString('hex') })
    .onConflictDoNothing();
  const [s] = await db.select().from(t.usageSalt).where(eq(t.usageSalt.day, day));
  return s!.salt;
}

/**
 * Compte une ouverture de chaque clé pour une personne (profil, sinon compte) : `events` +1, et `persons` +1 la
 * première fois du jour (empreinte HMAC avec le sel du jour, effacée après 2 jours). Rien d'autre n'est gardé.
 */
export async function recordUsage(
  db: Db,
  subjectId: string,
  role: string,
  keys: readonly string[],
  now = new Date(),
): Promise<void> {
  if (!keys.length) return;
  const day = dayOf(now);
  const salt = await saltOf(db, day);
  const fp = createHmac('sha256', salt).update(subjectId).digest('base64url').slice(0, 22);
  for (const key of keys) {
    const seen = await db
      .insert(t.usageSeen)
      .values({ day, key, fingerprint: fp })
      .onConflictDoNothing()
      .returning({ k: t.usageSeen.key });
    const first = seen.length ? 1 : 0;
    await db
      .insert(t.usageDay)
      .values({ day, key, role, persons: first, events: 1 })
      .onConflictDoUpdate({
        target: [t.usageDay.day, t.usageDay.key, t.usageDay.role],
        set: {
          persons: sql`${t.usageDay.persons} + ${first}`,
          events: sql`${t.usageDay.events} + 1`,
        },
      });
  }
}

export interface UsageRow {
  cle: string;
  /** personnes-jours (une personne comptée une fois par jour) ; null sous le seuil d'anonymat */
  personnesJours: number | null;
  ouvertures: number | null;
  sousSeuil: boolean;
}

/** Usage par clé sur `days` jours, tous rôles ou un rôle ; chiffres masqués sous le seuil d'anonymat. */
export async function usageReport(
  db: Db,
  days: number,
  threshold: number,
  role: string | null = null,
  now = new Date(),
): Promise<UsageRow[]> {
  const since = dayOf(new Date(now.getTime() - (days - 1) * 86_400_000));
  const rows = await db
    .select({
      key: t.usageDay.key,
      persons: sql<number>`sum(${t.usageDay.persons})::int`,
      events: sql<number>`sum(${t.usageDay.events})::int`,
    })
    .from(t.usageDay)
    .where(and(gte(t.usageDay.day, since), role ? eq(t.usageDay.role, role) : undefined))
    .groupBy(t.usageDay.key);
  return rows.map((r) => {
    const sous = r.persons < threshold;
    return {
      cle: r.key,
      personnesJours: sous ? null : r.persons,
      ouvertures: sous ? null : r.events,
      sousSeuil: sous,
    };
  });
}

export interface LessonStat {
  unitId: string;
  titre: string | null;
  niveau: string;
  commencees: number;
  abandonnees: number;
  terminees: number;
  /** minutes, médiane du temps entre la première et la dernière réponse d'une leçon terminée */
  minutesMedianes: number | null;
}

/**
 * Leçons où l'on abandonne et temps passé, à partir des données d'apprentissage déjà gardées (progression,
 * réponses) — aucun suivi supplémentaire. Abandon = leçon commencée, non terminée, sans réponse depuis 7 jours.
 * Seules les leçons commencées par au moins `threshold` profils distincts sont montrées.
 */
export async function lessonStats(
  db: Db,
  threshold: number,
  limit = 30,
  now = new Date(),
): Promise<LessonStat[]> {
  const stale = new Date(now.getTime() - 7 * 86_400_000);
  const r = await db.execute<{
    unit_id: string;
    level_code: string;
    title: string | null;
    started: number;
    dropped: number;
    done: number;
    minutes: number | null;
  }>(sql`
    WITH p AS (
      SELECT pr.unit_id, pr.profile_id, pr.status, pr.updated_at
      FROM progress pr JOIN unit u ON u.id = pr.unit_id
      WHERE u.kind = 'lecon'
    ), dur AS (
      SELECT a.unit_id, a.profile_id,
             LEAST(EXTRACT(EPOCH FROM (max(a.device_at) - min(a.device_at))) / 60.0, 120) AS m
      FROM attempt a JOIN p ON p.unit_id = a.unit_id AND p.profile_id = a.profile_id
      WHERE p.status IN ('terminee', 'maitrisee')
      GROUP BY a.unit_id, a.profile_id
    )
    SELECT p.unit_id, u.level_code,
      (SELECT uv.title_fr FROM unit_version uv JOIN edition e ON e.id = uv.edition_id
        WHERE uv.unit_id = p.unit_id AND e.status = 'publiee' ORDER BY e.published_at DESC LIMIT 1) AS title,
      count(DISTINCT p.profile_id)::int AS started,
      count(DISTINCT p.profile_id) FILTER (WHERE p.status = 'commencee' AND p.updated_at < ${stale})::int AS dropped,
      count(DISTINCT p.profile_id) FILTER (WHERE p.status IN ('terminee', 'maitrisee'))::int AS done,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.m) FROM dur d WHERE d.unit_id = p.unit_id
        HAVING count(*) >= ${threshold})::real AS minutes
    FROM p JOIN unit u ON u.id = p.unit_id
    GROUP BY p.unit_id, u.level_code
    HAVING count(DISTINCT p.profile_id) >= ${threshold}
    ORDER BY (count(DISTINCT p.profile_id) FILTER (WHERE p.status = 'commencee' AND p.updated_at < ${stale}))::real
      / count(DISTINCT p.profile_id) DESC, p.unit_id
    LIMIT ${limit}
  `);
  return r.rows.map((x) => ({
    unitId: x.unit_id,
    titre: x.title,
    niveau: x.level_code,
    commencees: x.started,
    abandonnees: x.dropped,
    terminees: x.done,
    minutesMedianes: x.minutes == null ? null : Math.round(Number(x.minutes) * 10) / 10,
  }));
}

// ------------------------------------------------------------------ conservation

/**
 * Durées de conservation F5 (travailleur, chaque nuit) : empreintes et sels d'usage de plus de 2 jours ;
 * captures des avis après 90 jours ; avis après 12 mois.
 */
export async function purgeF5(
  db: Db,
  now = new Date(),
): Promise<{ empreintes: number; captures: number; avis: number }> {
  const cut = dayOf(new Date(now.getTime() - 2 * 86_400_000));
  const empreintes = (await db.delete(t.usageSeen).where(lt(t.usageSeen.day, cut))).rowCount ?? 0;
  await db.delete(t.usageSalt).where(lt(t.usageSalt.day, cut));
  const captures =
    (
      await db
        .update(t.feedback)
        .set({ capture: null, captureType: null })
        .where(
          and(
            isNotNull(t.feedback.captureType),
            lt(t.feedback.createdAt, new Date(now.getTime() - 90 * 86_400_000)),
          ),
        )
    ).rowCount ?? 0;
  const avis =
    (
      await db
        .delete(t.feedback)
        .where(lt(t.feedback.createdAt, new Date(now.getTime() - 365 * 86_400_000)))
    ).rowCount ?? 0;
  return { empreintes, captures, avis };
}
