/**
 * Lot 6 : entraînement (tracé, cartes de mots), tableau de bord parent / adulte, page publique du QR code.
 */
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { maskTree, publicProjection } from '@awform/content';
import { deviceTime, hasNul, isolated, REFUSED, validDay } from './bounds.js';
import type { Db } from './client.js';
import * as t from './schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(['trace', 'carte']);

export interface PracticeInput {
  id: string;
  profileId: string;
  kind: 'trace' | 'carte';
  item: string;
  ok: boolean;
  day: string;
  details?: unknown;
  deviceAt: string;
}

export async function recordPractice(
  db: Db,
  events: readonly PracticeInput[],
): Promise<{
  accepted: string[];
  duplicates: string[];
  rejected: Array<{ id: string; reason: string }>;
}> {
  const res = {
    accepted: [] as string[],
    duplicates: [] as string[],
    rejected: [] as Array<{ id: string; reason: string }>,
  };
  for (const e of events) {
    if (!e || !UUID.test(String(e.id)) || !UUID.test(String(e.profileId))) {
      res.rejected.push({ id: String(e?.id ?? ''), reason: 'identifiant invalide' });
      continue;
    }
    if (
      !KINDS.has(String(e.kind)) ||
      typeof e.item !== 'string' ||
      e.item.length === 0 ||
      e.item.length > 80 ||
      typeof e.ok !== 'boolean' ||
      !validDay(e.day) ||
      !deviceTime(e.deviceAt) ||
      hasNul(e.item) ||
      hasNul(e.details) ||
      JSON.stringify(e.details ?? null).length > 4000
    ) {
      res.rejected.push({ id: e.id, reason: 'événement invalide' });
      continue;
    }
    const rows = await isolated(() =>
      db
        .insert(t.practiceEvent)
        .values({
          id: e.id,
          profileId: e.profileId,
          kind: e.kind,
          item: e.item,
          ok: e.ok,
          day: e.day,
          details: e.details ?? null,
          deviceAt: deviceTime(e.deviceAt)!,
        })
        .onConflictDoNothing()
        .returning({ id: t.practiceEvent.id }),
    );
    if (rows === REFUSED) res.rejected.push({ id: e.id, reason: 'données invalides' });
    else (rows.length ? res.accepted : res.duplicates).push(e.id);
  }
  return res;
}

export interface DashboardDay {
  day: string;
  reponses: number;
  traces: number;
  cartes: number;
  hifz: number;
}

/**
 * Tableau de bord d'un profil : progression par niveau (unités par état), activité des `days` derniers
 * jours, totaux de l'entraînement. Aucune note de tracé, aucun classement.
 */
export async function dashboard(db: Db, profileId: string, today: string, days = 14) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const progress = await db
    .select({ level: t.unit.levelCode, status: t.progress.status, n: sql<number>`count(*)::int` })
    .from(t.progress)
    .innerJoin(t.unit, eq(t.unit.id, t.progress.unitId))
    .where(eq(t.progress.profileId, profileId))
    .groupBy(t.unit.levelCode, t.progress.status);
  const answers = await db
    .select({
      day: sql<string>`to_char(${t.attempt.deviceAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(t.attempt)
    .where(
      and(
        eq(t.attempt.profileId, profileId),
        gte(t.attempt.deviceAt, new Date(`${from}T00:00:00Z`)),
      ),
    )
    .groupBy(sql`1`);
  const practice = await db
    .select({
      day: t.practiceEvent.day,
      kind: t.practiceEvent.kind,
      ok: t.practiceEvent.ok,
      n: sql<number>`count(*)::int`,
    })
    .from(t.practiceEvent)
    .where(and(eq(t.practiceEvent.profileId, profileId), gte(t.practiceEvent.day, from)))
    .groupBy(t.practiceEvent.day, t.practiceEvent.kind, t.practiceEvent.ok);
  const hifz = await db
    .select({ day: t.hifzEvent.day, n: sql<number>`count(*)::int` })
    .from(t.hifzEvent)
    .where(and(eq(t.hifzEvent.profileId, profileId), gte(t.hifzEvent.day, from)))
    .groupBy(t.hifzEvent.day);
  const totals = await db
    .select({ kind: t.practiceEvent.kind, ok: t.practiceEvent.ok, n: sql<number>`count(*)::int` })
    .from(t.practiceEvent)
    .where(eq(t.practiceEvent.profileId, profileId))
    .groupBy(t.practiceEvent.kind, t.practiceEvent.ok);
  const activity: DashboardDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    activity.push({
      day,
      reponses: answers.find((a) => a.day === day)?.n ?? 0,
      traces: practice
        .filter((p) => p.day === day && p.kind === 'trace')
        .reduce((s, p) => s + p.n, 0),
      cartes: practice
        .filter((p) => p.day === day && p.kind === 'carte')
        .reduce((s, p) => s + p.n, 0),
      hifz: hifz.find((h) => h.day === day)?.n ?? 0,
    });
  }
  const levels: Record<string, Record<string, number>> = {};
  for (const p of progress) (levels[p.level] ??= {})[p.status] = p.n;
  const sum = (kind: string, ok?: boolean) =>
    totals
      .filter((x) => x.kind === kind && (ok === undefined || x.ok === ok))
      .reduce((s, x) => s + x.n, 0);
  return {
    levels,
    activity,
    traces: { total: sum('trace'), reussis: sum('trace', true) },
    cartes: { total: sum('carte'), sus: sum('carte', true) },
  };
}

/** Page publique du QR code `/l/<niveau>-<NN>` : projection publique (ni exercices ni réponses). */
export async function publicUnit(db: Db, editionId: string, slug: string) {
  const [r] = await db
    .select({ unitId: t.qrRedirect.unitId })
    .from(t.qrRedirect)
    .where(eq(t.qrRedirect.slug, slug));
  if (!r) return null;
  const [u] = await db
    .select({
      id: t.unit.id,
      levelCode: t.unit.levelCode,
      kind: t.unit.kind,
      numLecon: t.unitVersion.numLecon,
      titleAr: t.unitVersion.titleAr,
      titleFr: t.unitVersion.titleFr,
      content: t.unitVersion.content,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(and(eq(t.unitVersion.editionId, editionId), eq(t.unitVersion.unitId, r.unitId)));
  if (!u) return { unitId: r.unitId, levelCode: null, lesson: null, illustrations: {} };
  // audit CON-3 : page publique (sans compte) : AUCUN numéro de hadith, vérifié ou non
  const lesson = maskTree(publicProjection(u.content), new Set<string>()).value as {
    mots: Array<{ img?: string }>;
  };
  const keys = [...new Set(lesson.mots.map((m) => m.img).filter((k): k is string => !!k))];
  const ill = keys.length
    ? await db
        .select({
          key: t.illustration.key,
          viewBox: t.illustration.viewBox,
          svg: t.illustration.svg,
        })
        .from(t.illustration)
        .where(and(eq(t.illustration.editionId, editionId), inArray(t.illustration.key, keys)))
        .orderBy(asc(t.illustration.key))
    : [];
  return {
    unitId: u.id,
    levelCode: u.levelCode,
    kind: u.kind,
    numLecon: u.numLecon,
    titleAr: u.titleAr,
    titleFr: u.titleFr,
    lesson,
    illustrations: Object.fromEntries(ill.map((i) => [i.key, { viewBox: i.viewBox, svg: i.svg }])),
  };
}
