/**
 * Khatma et wird (26/10/2026, interrupteur `khatma_wird`) : plans, parts, avancement.
 *
 * Règles de conception :
 *  - le plan fixe l'ESSENTIEL (durée ou pages par jour, date de fin) ; la part du jour est RECALCULÉE par l'appareil à partir
 *    de l'avancement (avance ou retard) : aucune dette cumulée, aucun retard affiché, aucune série à ne pas casser ;
 *  - l'avancement ne recule jamais par accident (le serveur garde le plus avancé quand deux appareils écrivent) ; un recul
 *    est une correction EXPLICITE (`corrige`) ;
 *  - une khatma de famille ou de classe répartit les 604 pages du Muṣḥaf de Médine en parts (juzʾ entiers quand on est
 *    30 au plus, sinon des tranches de pages) ; elle se termine quand TOUTES les parts sont lues ;
 *  - aucun classement : un participant ne voit que le total du groupe ; seul le responsable (parent, enseignant) voit les
 *    parts de chacun (et, en « mode serein », sans pourcentage) ;
 *  - la position EXACTE (sourate, verset) permet de reprendre au même endroit sur tous les appareils.
 * Le texte coranique n'est jamais manipulé ici : seulement des numéros de pages et de versets.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/** Pages du Muṣḥaf de Médine. */
export const KHATMA_PAGES = 604;
export const KHATMA_MAX_ACTIVES = 3;
/** pages par jour admises (plan « pages » et wird) */
export const KHATMA_PPD_MAX = 100;
/** durée maximale d'une khatma (un an et demi) */
export const KHATMA_JOURS_MAX = 550;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validKhatmaDay = (d: unknown): d is string =>
  typeof d === 'string' && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
export const khatmaAddDays = (d: string, n: number) =>
  new Date((dayNum(d) + n) * 86_400_000).toISOString().slice(0, 10);

/** Première page du juzʾ n (Muṣḥaf de Médine : 20 pages par juzʾ, le premier en compte 21). */
export const juzStartPage = (n: number) => (n <= 1 ? 1 : 2 + 20 * (n - 1));

/**
 * Répartition de la lecture entre `n` personnes : juzʾ entiers (consécutifs, à un juzʾ près) quand n ≤ 30, sinon des
 * tranches de pages (à une page près). Renvoie `n` intervalles [première page, dernière page], dans l'ordre du Muṣḥaf.
 */
export function repartirKhatma(n: number): Array<[number, number]> {
  if (!Number.isInteger(n) || n < 1 || n > KHATMA_PAGES) throw new Error('participants_invalides');
  const out: Array<[number, number]> = [];
  if (n <= 30) {
    const base = Math.floor(30 / n);
    const extra = 30 % n;
    let juz = 1;
    for (let i = 0; i < n; i++) {
      const k = base + (i < extra ? 1 : 0);
      const first = juzStartPage(juz);
      juz += k;
      out.push([first, juz > 30 ? KHATMA_PAGES : juzStartPage(juz) - 1]);
    }
    return out;
  }
  const base = Math.floor(KHATMA_PAGES / n);
  const extra = KHATMA_PAGES % n;
  let p = 1;
  for (let i = 0; i < n; i++) {
    const k = base + (i < extra ? 1 : 0);
    out.push([p, p + k - 1]);
    p += k;
  }
  return out;
}

export type KhatmaRow = typeof t.khatma.$inferSelect;
export type KhatmaPartRow = typeof t.khatmaPart.$inferSelect;

export interface KhatmaInput {
  kind: 'khatma' | 'wird';
  scope: 'profil' | 'famille' | 'classe';
  ownerAccountId: string;
  classId?: string | null;
  title?: string | null;
  mode: 'duree' | 'pages' | 'wird';
  startDate: string;
  endDate?: string | null;
  pagesPerDay?: number | null;
  reminderHour?: number | null;
  /** profils qui participent (un seul pour une khatma personnelle) */
  profileIds: string[];
  /** avancement déjà fait (pages), pour la khatma d'une personne : reprend sa lecture existante */
  seedDone?: number;
  seedSura?: number | null;
  seedAya?: number | null;
}

/** Contrôle d'un plan avant création ; renvoie le code d'erreur ou null. */
export function checkKhatmaInput(i: KhatmaInput): string | null {
  if ((i.kind === 'wird') !== (i.mode === 'wird')) return 'plan_invalide';
  if (!validKhatmaDay(i.startDate)) return 'date_invalide';
  if (i.mode === 'duree') {
    if (!validKhatmaDay(i.endDate)) return 'date_invalide';
    const jours = dayNum(i.endDate) - dayNum(i.startDate) + 1;
    if (jours < 1 || jours > KHATMA_JOURS_MAX) return 'duree_invalide';
  } else if (
    !Number.isInteger(i.pagesPerDay) ||
    (i.pagesPerDay as number) < 1 ||
    (i.pagesPerDay as number) > KHATMA_PPD_MAX
  )
    return 'rythme_invalide';
  if (i.scope !== 'profil' && i.mode !== 'duree') return 'plan_invalide';
  if (i.scope !== 'profil' && i.kind !== 'khatma') return 'plan_invalide';
  if (i.scope === 'profil' && i.profileIds.length !== 1) return 'participants_invalides';
  if (i.scope !== 'profil' && (i.profileIds.length < 2 || i.profileIds.length > 60))
    return 'participants_invalides';
  if (i.scope === 'classe' && !i.classId) return 'classe_requise';
  if (
    i.reminderHour != null &&
    !(Number.isInteger(i.reminderHour) && i.reminderHour >= 0 && i.reminderHour <= 23)
  )
    return 'rappel_invalide';
  if (i.title != null && i.title.length > 40) return 'titre_invalide';
  if (
    i.seedDone != null &&
    !(Number.isInteger(i.seedDone) && i.seedDone >= 0 && i.seedDone < KHATMA_PAGES)
  )
    return 'avancement_invalide';
  return null;
}

/** Crée le plan et les parts. Le plus avancé d'un profil existant n'est jamais écrasé (création = nouveau plan). */
export async function createKhatma(
  db: Db,
  i: KhatmaInput,
): Promise<{ khatma: KhatmaRow; parts: KhatmaPartRow[] }> {
  const bad = checkKhatmaInput(i);
  if (bad) throw new Error(bad);
  return db.transaction(async (tx) => {
    // au plus 3 plans actifs par profil (la lecture reste simple)
    const actives = await tx
      .select({ p: t.khatmaPart.profileId, n: sql<number>`count(*)::int` })
      .from(t.khatmaPart)
      .innerJoin(t.khatma, eq(t.khatma.id, t.khatmaPart.khatmaId))
      .where(and(inArray(t.khatmaPart.profileId, i.profileIds), eq(t.khatma.status, 'active')))
      .groupBy(t.khatmaPart.profileId);
    if (actives.some((a) => a.n >= KHATMA_MAX_ACTIVES)) throw new Error('trop_de_plans');
    const [k] = await tx
      .insert(t.khatma)
      .values({
        kind: i.kind,
        scope: i.scope,
        ownerAccountId: i.ownerAccountId,
        classId: i.scope === 'classe' ? (i.classId ?? null) : null,
        title: i.title?.trim() || null,
        mode: i.mode,
        startDate: i.startDate,
        endDate: i.mode === 'duree' ? (i.endDate ?? null) : null,
        pagesPerDay: i.mode === 'duree' ? null : (i.pagesPerDay ?? null),
        reminderHour: i.reminderHour ?? null,
      })
      .returning();
    const ranges =
      i.scope === 'profil'
        ? [[1, KHATMA_PAGES] as [number, number]]
        : repartirKhatma(i.profileIds.length);
    const parts: KhatmaPartRow[] = [];
    for (const [idx, profileId] of i.profileIds.entries()) {
      const [first, last] = ranges[idx]!;
      const seed = i.scope === 'profil' ? Math.min(i.seedDone ?? 0, last - first + 1) : 0;
      const [p] = await tx
        .insert(t.khatmaPart)
        .values({
          khatmaId: k!.id,
          profileId,
          firstPage: first,
          lastPage: last,
          done: seed,
          doneDayStart: seed,
          dayMark: seed ? i.startDate : null,
          posSura: seed ? (i.seedSura ?? null) : null,
          posAya: seed ? (i.seedAya ?? null) : null,
        })
        .returning();
      parts.push(p!);
    }
    return { khatma: k!, parts };
  });
}

export interface KhatmaGroupSummary {
  parts: number;
  terminees: number;
  /** pages lues / pages à lire, toutes parts réunies (jamais par personne) */
  pagesLues: number;
  pagesTotal: number;
}

/** Résumé collectif d'une khatma de groupe (le seul chiffre qu'un participant voit). */
export async function khatmaGroupSummary(db: Db, khatmaId: string): Promise<KhatmaGroupSummary> {
  const rows = await db
    .select({
      first: t.khatmaPart.firstPage,
      last: t.khatmaPart.lastPage,
      done: t.khatmaPart.done,
      fin: t.khatmaPart.finishedAt,
    })
    .from(t.khatmaPart)
    .where(eq(t.khatmaPart.khatmaId, khatmaId));
  let lues = 0;
  let total = 0;
  for (const r of rows) {
    const size = r.last - r.first + 1;
    total += size;
    lues += Math.min(size, r.done);
  }
  return {
    parts: rows.length,
    terminees: rows.filter((r) => r.fin).length,
    pagesLues: lues,
    pagesTotal: total,
  };
}

export interface KhatmaProfilePlan {
  khatma: KhatmaRow;
  part: KhatmaPartRow;
  groupe: KhatmaGroupSummary | null;
}

/** Plans d'un profil (actifs d'abord, puis terminés récents), avec sa part et, pour un groupe, le total collectif. */
export async function profileKhatmas(db: Db, profileId: string): Promise<KhatmaProfilePlan[]> {
  const rows = await db
    .select({ k: t.khatma, p: t.khatmaPart })
    .from(t.khatmaPart)
    .innerJoin(t.khatma, eq(t.khatma.id, t.khatmaPart.khatmaId))
    .where(and(eq(t.khatmaPart.profileId, profileId), sql`${t.khatma.status} <> 'archivee'`))
    .orderBy(asc(t.khatma.status), sql`${t.khatma.createdAt} DESC`);
  const out: KhatmaProfilePlan[] = [];
  for (const r of rows)
    out.push({
      khatma: r.k,
      part: r.p,
      groupe: r.k.scope === 'profil' ? null : await khatmaGroupSummary(db, r.k.id),
    });
  return out;
}

export async function getKhatma(db: Db, id: string): Promise<KhatmaRow | null> {
  const [k] = await db.select().from(t.khatma).where(eq(t.khatma.id, id));
  return k ?? null;
}

export async function getKhatmaPart(
  db: Db,
  khatmaId: string,
  profileId: string,
): Promise<KhatmaPartRow | null> {
  const [p] = await db
    .select()
    .from(t.khatmaPart)
    .where(and(eq(t.khatmaPart.khatmaId, khatmaId), eq(t.khatmaPart.profileId, profileId)));
  return p ?? null;
}

export interface KhatmaProgressInput {
  /** pages lues dans la part (cumulées sur tous les tours pour un wird) */
  done: number;
  /** jour LOCAL de l'appareil (AAAA-MM-JJ) */
  day: string;
  sura?: number | null;
  aya?: number | null;
  /** correction explicite à la baisse (sinon l'avancement ne recule jamais) */
  corrige?: boolean;
}

/**
 * Enregistre l'avancement d'une part (idempotent, monotone). Le point de départ du jour (`done_day_start`) est fixé à la
 * première écriture du jour ; la part est terminée quand toutes ses pages sont lues ; la khatma d'un groupe est terminée
 * quand toutes ses parts le sont.
 */
export async function recordKhatmaProgress(
  db: Db,
  khatmaId: string,
  profileId: string,
  p: KhatmaProgressInput,
  now = new Date(),
): Promise<{ part: KhatmaPartRow; khatma: KhatmaRow; groupe: KhatmaGroupSummary | null } | null> {
  const k = await getKhatma(db, khatmaId);
  const part = k ? await getKhatmaPart(db, khatmaId, profileId) : null;
  if (!k || !part || k.status === 'archivee') return null;
  if (!Number.isInteger(p.done) || p.done < 0 || p.done > 604 * 400)
    throw new Error('avancement_invalide');
  if (
    !validKhatmaDay(p.day) ||
    Math.abs(dayNum(p.day) - dayNum(now.toISOString().slice(0, 10))) > 1
  )
    throw new Error('date_invalide');
  const size = part.lastPage - part.firstPage + 1;
  const cap = k.kind === 'wird' ? p.done : Math.min(p.done, size);
  const done = p.corrige ? cap : Math.max(part.done, cap);
  const sura =
    Number.isInteger(p.sura) && (p.sura as number) >= 1 && (p.sura as number) <= 114
      ? p.sura!
      : null;
  const aya =
    Number.isInteger(p.aya) && (p.aya as number) >= 1 && (p.aya as number) <= 286 ? p.aya! : null;
  const newDay = part.dayMark !== p.day;
  const finished = k.kind === 'khatma' && done >= size;
  const [row] = await db
    .update(t.khatmaPart)
    .set({
      done,
      ...(newDay ? { dayMark: p.day, doneDayStart: part.done } : {}),
      ...(done > part.done || p.corrige ? { posSura: sura, posAya: aya } : {}),
      finishedAt: finished ? (part.finishedAt ?? now) : null,
      updatedAt: now,
    })
    .where(eq(t.khatmaPart.id, part.id))
    .returning();
  let khatma = k;
  let groupe: KhatmaGroupSummary | null = null;
  if (k.scope === 'profil') {
    if (finished && k.status === 'active')
      khatma = (
        await db
          .update(t.khatma)
          .set({ status: 'terminee', doneAt: now, updatedAt: now })
          .where(eq(t.khatma.id, k.id))
          .returning()
      )[0]!;
    else if (!finished && k.status === 'terminee')
      khatma = (
        await db
          .update(t.khatma)
          .set({ status: 'active', doneAt: null, updatedAt: now })
          .where(eq(t.khatma.id, k.id))
          .returning()
      )[0]!;
  } else {
    groupe = await khatmaGroupSummary(db, k.id);
    const all = groupe.terminees === groupe.parts && groupe.parts > 0;
    if (all && k.status === 'active')
      khatma = (
        await db
          .update(t.khatma)
          .set({ status: 'terminee', doneAt: now, updatedAt: now })
          .where(eq(t.khatma.id, k.id))
          .returning()
      )[0]!;
    else if (!all && k.status === 'terminee')
      khatma = (
        await db
          .update(t.khatma)
          .set({ status: 'active', doneAt: null, updatedAt: now })
          .where(eq(t.khatma.id, k.id))
          .returning()
      )[0]!;
  }
  return { part: row!, khatma, groupe };
}

export interface KhatmaPatch {
  endDate?: string;
  pagesPerDay?: number;
  reminderHour?: number | null;
  title?: string | null;
  status?: 'archivee';
}

/** Modifie un plan (fin, rythme, rappel, titre) ou l'archive. */
export async function patchKhatma(db: Db, id: string, p: KhatmaPatch): Promise<KhatmaRow | null> {
  const k = await getKhatma(db, id);
  if (!k) return null;
  const set: Partial<typeof t.khatma.$inferInsert> = { updatedAt: new Date() };
  if (p.endDate !== undefined) {
    if (k.mode !== 'duree' || !validKhatmaDay(p.endDate)) throw new Error('date_invalide');
    const jours = dayNum(p.endDate) - dayNum(k.startDate) + 1;
    if (jours < 1 || jours > KHATMA_JOURS_MAX) throw new Error('duree_invalide');
    set.endDate = p.endDate;
  }
  if (p.pagesPerDay !== undefined) {
    if (
      k.mode === 'duree' ||
      !Number.isInteger(p.pagesPerDay) ||
      p.pagesPerDay < 1 ||
      p.pagesPerDay > KHATMA_PPD_MAX
    )
      throw new Error('rythme_invalide');
    set.pagesPerDay = p.pagesPerDay;
  }
  if (p.reminderHour !== undefined) {
    if (
      p.reminderHour !== null &&
      !(Number.isInteger(p.reminderHour) && p.reminderHour >= 0 && p.reminderHour <= 23)
    )
      throw new Error('rappel_invalide');
    set.reminderHour = p.reminderHour;
  }
  if (p.title !== undefined) {
    if (p.title !== null && p.title.length > 40) throw new Error('titre_invalide');
    set.title = p.title?.trim() || null;
  }
  if (p.status === 'archivee') set.status = 'archivee';
  const [row] = await db.update(t.khatma).set(set).where(eq(t.khatma.id, id)).returning();
  return row ?? null;
}

export interface KhatmaMembreSuivi {
  profileId: string;
  pseudonym: string;
  firstPage: number;
  lastPage: number;
  done: number;
  terminee: boolean;
}

/** Suivi pour le RESPONSABLE d'un groupe (parent, enseignant) : une ligne par part, dans l'ordre du Muṣḥaf. */
export async function suiviKhatma(db: Db, khatmaId: string): Promise<KhatmaMembreSuivi[]> {
  const rows = await db
    .select({
      profileId: t.khatmaPart.profileId,
      pseudonym: t.profile.pseudonym,
      first: t.khatmaPart.firstPage,
      last: t.khatmaPart.lastPage,
      done: t.khatmaPart.done,
      fin: t.khatmaPart.finishedAt,
    })
    .from(t.khatmaPart)
    .innerJoin(t.profile, eq(t.profile.id, t.khatmaPart.profileId))
    .where(eq(t.khatmaPart.khatmaId, khatmaId))
    .orderBy(asc(t.khatmaPart.firstPage));
  return rows.map((r) => ({
    profileId: r.profileId,
    pseudonym: r.pseudonym,
    firstPage: r.first,
    lastPage: r.last,
    done: Math.min(r.done, r.last - r.first + 1),
    terminee: !!r.fin,
  }));
}

/** Confie la part d'un participant à un autre profil du groupe qui n'en a pas encore (par ex. un élève absent). */
export async function confierPartKhatma(
  db: Db,
  khatmaId: string,
  fromProfileId: string,
  toProfileId: string,
): Promise<boolean> {
  const from = await getKhatmaPart(db, khatmaId, fromProfileId);
  const to = await getKhatmaPart(db, khatmaId, toProfileId);
  if (!from || to) return false;
  const r = await db
    .update(t.khatmaPart)
    .set({ profileId: toProfileId, updatedAt: new Date() })
    .where(eq(t.khatmaPart.id, from.id))
    .returning({ id: t.khatmaPart.id });
  return r.length > 0;
}

/** Plans actifs d'un compte dont le rappel tombe à `heure` (heure locale) : sert le rappel discret du travailleur. */
export async function rappelsKhatma(
  db: Db,
  accountProfileIds: readonly string[],
  heure: number,
  jour: string,
): Promise<number> {
  if (!accountProfileIds.length) return 0;
  const rows = await db
    .select({
      k: t.khatma.id,
      kind: t.khatma.kind,
      done: t.khatmaPart.done,
      first: t.khatmaPart.firstPage,
      last: t.khatmaPart.lastPage,
      dayMark: t.khatmaPart.dayMark,
      start: t.khatmaPart.doneDayStart,
    })
    .from(t.khatmaPart)
    .innerJoin(t.khatma, eq(t.khatma.id, t.khatmaPart.khatmaId))
    .where(
      and(
        inArray(t.khatmaPart.profileId, [...accountProfileIds]),
        eq(t.khatma.status, 'active'),
        eq(t.khatma.reminderHour, heure),
      ),
    );
  // pas de rappel pour une part déjà lue aujourd'hui (au moins une page de plus qu'au début du jour)
  return rows.filter((r) => !(r.dayMark === jour && r.done > r.start)).length;
}
