/**
 * Hifẓ sur l'appareil (lot 5) : carnet ou plan, texte Tanzil, journal (serveur + file locale), plan du
 * jour recalculé HORS LIGNE par @awform/hifz. Tout ce qui est téléchargé est gardé dans IndexedDB :
 * l'élève peut réciter et noter ses révisions sans réseau ; les événements partent avec la file commune.
 * Aucun audio n'est téléchargé (aucune récitation sans licence écrite).
 */
import {
  bookConfig,
  bookParts,
  buildParts,
  dayOfIso,
  forecast,
  learningSequence,
  nextPortion,
  partsOverlapping,
  replay,
  requiredMinutes,
  rhythm,
  dailyMinutes,
  suggestRhythm,
  trialStats,
  weekOf,
  weekTasks,
  TRIAL_DAYS,
  type BookPart,
  type DayPlan,
  type EngineConfig,
  type HifzBookData,
  type HifzEvent,
  type HifzState,
  type Part,
  type PartInfo,
  type Portion,
  type QuranMeta,
  type Quality,
  type Source,
  type VerseRef,
  type WeekTask,
} from '@awform/hifz';
import { enqueue } from './attempts';
import { getAll, kvGet, kvSet } from './idb';
import { call } from './session';
import type { AttemptEvent } from './sync-core';

export interface PlanRow {
  profileId: string;
  mode: 'carnet' | 'rythme';
  bookCode: string | null;
  rhythmYears: number | null;
  suraOrder: 'rebours' | 'juz30';
  startDate: string;
  trial: boolean;
  newFactor: number;
  reliefUntil: string | null;
}

export interface ServerEvent {
  id: string;
  day: string;
  part: string;
  kind: 'appris' | 'revision';
  q: number | null;
  source: Source;
  pos: number | null;
  details: Record<string, unknown> | null;
}

export interface ProfileHifz {
  plan: PlanRow | null;
  events: ServerEvent[];
  classes: Array<{ id: string; name: string }>;
}

export interface BookPack {
  book: HifzBookData;
  verses: Record<string, string>;
  basmala: string;
}

/** Date locale « AAAA-MM-JJ » (jour de l'élève). */
export function localIso(d = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
}

async function cached<T>(key: string, fetcher: () => Promise<T | null>): Promise<T | null> {
  const fresh = await fetcher().catch(() => null);
  if (fresh) {
    await kvSet(key, fresh).catch(() => {});
    return fresh;
  }
  return ((await kvGet<T>(key).catch(() => undefined)) as T | undefined) ?? null;
}

export async function loadMeta(): Promise<(QuranMeta & { basmala: string }) | null> {
  const local = await kvGet<QuranMeta & { basmala: string }>('quranMeta').catch(() => undefined);
  if (local) return local; // texte de référence figé : une copie suffit
  return cached('quranMeta', async () => {
    const r = await call<QuranMeta & { basmala: string }>('GET', '/quran/meta');
    return r.ok ? r.data : null;
  });
}

export async function loadBook(code: string): Promise<BookPack | null> {
  return cached(`hifzBook:${code}`, async () => {
    const r = await call<BookPack>('GET', `/hifz/books/${code}`);
    return r.ok ? r.data : null;
  });
}

/** Versets d'un passage : copie locale d'abord, sinon Tanzil depuis le serveur (puis gardés). */
export async function loadVerses(
  s: number,
  from: number,
  to: number,
): Promise<Array<{ s: number; a: number; text: string }>> {
  const key = `verses:${s}`;
  const have = (await kvGet<Record<string, string>>(key).catch(() => undefined)) ?? {};
  const missing = [];
  for (let a = from; a <= to; a++) if (have[a] === undefined) missing.push(a);
  if (missing.length) {
    const r = await call<{ verses: Array<{ s: number; a: number; text: string }> }>(
      'GET',
      `/quran/verses?s=${s}&from=${Math.min(...missing)}&to=${Math.max(...missing)}`,
    );
    if (r.ok && r.data) {
      for (const v of r.data.verses) have[v.a] = v.text;
      await kvSet(key, have).catch(() => {});
    }
  }
  const out = [];
  for (let a = from; a <= to; a++) if (have[a] !== undefined) out.push({ s, a, text: have[a]! });
  return out;
}

export async function loadProfileHifz(profileId: string): Promise<ProfileHifz | null> {
  return cached(`hifz:${profileId}`, async () => {
    const r = await call<ProfileHifz>('GET', `/hifz/profiles/${profileId}`);
    return r.ok ? r.data : null;
  });
}

export async function savePlan(
  profileId: string,
  plan: Omit<
    PlanRow,
    'profileId' | 'bookCode' | 'rhythmYears' | 'suraOrder' | 'trial' | 'newFactor' | 'reliefUntil'
  > &
    Partial<PlanRow>,
): Promise<{ ok: boolean; code: string | null }> {
  const body: Record<string, unknown> = { mode: plan.mode, startDate: plan.startDate };
  if (plan.mode === 'carnet') body.bookCode = plan.bookCode;
  else {
    body.rhythmYears = plan.rhythmYears ?? 7;
    body.suraOrder = plan.suraOrder ?? 'rebours';
    body.trial = plan.trial ?? false;
  }
  if (plan.newFactor !== undefined) body.newFactor = plan.newFactor;
  if (plan.reliefUntil !== undefined) body.reliefUntil = plan.reliefUntil;
  const r = await call<{ plan: PlanRow }>('PUT', `/hifz/profiles/${profileId}/plan`, body);
  if (r.ok) await loadProfileHifz(profileId);
  return { ok: r.ok, code: r.code };
}

/** Événements du hifẓ encore dans la file de l'appareil (pas encore envoyés). */
export async function pendingHifz(profileId: string): Promise<ServerEvent[]> {
  const all = await getAll<AttemptEvent>('events').catch(() => [] as AttemptEvent[]);
  return all
    .filter((e) => e.eventType === 'hifz' && e.profileId === profileId)
    .map((e) => ({ id: e.id, ...(e.response as Omit<ServerEvent, 'id'>) }));
}

/** Ajoute un événement au journal (file hors ligne commune). */
export async function recordHifz(
  profileId: string,
  ev: {
    day: string;
    part: string;
    kind: 'appris' | 'revision';
    q?: Quality;
    source: Source;
    pos?: number;
    details?: unknown;
  },
): Promise<void> {
  await enqueue({ profileId, unitId: 'hifz', eventType: 'hifz', response: ev });
}

// ---------------------------------------------------------------- calcul du jour

export interface TodayView {
  mode: 'carnet' | 'rythme';
  today: string;
  plan: DayPlan;
  state: HifzState;
  parts: Map<string, PartInfo & { label: string; ref: VerseRange[] }>;
  /** carnet : semaine et tâches ; rythme : portion du jour */
  week: number | null;
  weekTasks: WeekTask[];
  portion: (Portion & { refs: VerseRange[] }) | null;
  /** portion déjà apprise aujourd'hui (rythme) */
  learnedToday: boolean;
  cfg: EngineConfig;
  requiredMinutes: number;
  trial: { day: number; done: boolean; suggestion: number | null } | null;
  progress: { acquiredParts: number; totalParts: number; pos: number; total: number };
  events: ServerEvent[];
}

export interface VerseRange {
  s: number;
  from: number;
  to: number;
}

export function toEngine(e: ServerEvent): HifzEvent {
  return {
    day: dayOfIso(e.day),
    id: e.id,
    part: e.part,
    kind: e.kind,
    q: (e.q ?? undefined) as Quality | undefined,
    source: e.source,
    pos: e.pos ?? undefined,
  };
}

export function computeToday(
  plan: PlanRow,
  events: ServerEvent[],
  meta: QuranMeta | null,
  pack: BookPack | null,
  todayIso = localIso(),
): TodayView | null {
  const today = dayOfIso(todayIso);
  const start = dayOfIso(plan.startDate);
  const eng = events.map(toEngine);
  if (plan.mode === 'carnet') {
    if (!pack || !meta) return null;
    const bp: BookPart[] = bookParts(pack.book, meta);
    const cfg = bookConfig(pack.book);
    const { state, plan: dp } = replay(bp, eng, today, cfg, Math.min(start, today));
    const week = weekOf(pack.book, start, today);
    return {
      mode: 'carnet',
      today: todayIso,
      plan: dp,
      state,
      parts: new Map(
        bp.map((p) => [p.key, { ...p, ref: [{ s: p.sura, from: p.from, to: p.to }] }]),
      ),
      week,
      weekTasks: weekTasks(pack.book, week),
      portion: null,
      learnedToday: false,
      cfg,
      requiredMinutes: cfg.dailyMinutes,
      trial: null,
      progress: {
        acquiredParts: [...state.parts.values()].filter((p) => p.learnedDay !== null).length,
        totalParts: bp.length,
        pos: 0,
        total: 0,
      },
      events,
    };
  }
  if (!meta) return null;
  const years = (plan.trial ? 7 : (plan.rhythmYears ?? 7)) as 3 | 4 | 5 | 6 | 7;
  const r = rhythm(years);
  const relief = plan.reliefUntil && todayIso <= plan.reliefUntil ? plan.newFactor : 1;
  const cfg: EngineConfig = {
    dailyMinutes: dailyMinutes(r),
    newMinutes: r.pagesPerDay * relief * 15,
  };
  const seq: VerseRef[] = learningSequence(meta, plan.suraOrder);
  const parts: Part[] = buildParts(meta, seq);
  const { state, plan: dp } = replay(parts, eng, today, cfg, Math.min(start, today));
  const learnedToday = eng.some((e) => e.kind === 'appris' && e.day === today);
  // la portion du jour part de la position AVANT les portions apprises aujourd'hui
  const posBefore = Math.max(
    0,
    ...eng
      .filter((e) => e.kind === 'appris' && e.day < today && e.pos !== undefined)
      .map((e) => e.pos!),
  );
  const suspended = plan.reliefUntil && todayIso <= plan.reliefUntil && plan.newFactor === 0;
  const p = suspended
    ? null
    : nextPortion(meta, seq, learnedToday ? posBefore : state.pos, r.pagesPerDay * relief);
  let trial: TodayView['trial'] = null;
  if (plan.trial) {
    const dayN = today - start + 1;
    const done = dayN > TRIAL_DAYS;
    trial = {
      day: Math.min(dayN, TRIAL_DAYS),
      done,
      suggestion: done ? suggestRhythm(trialStats(eng, start, today)) : null,
    };
  }
  return {
    mode: 'rythme',
    today: todayIso,
    plan: dp,
    state,
    parts: new Map(
      parts.map((x) => [
        x.key,
        { ...x, label: x.key, ref: x.segments.map((s) => ({ s: s.s, from: s.from, to: s.to })) },
      ]),
    ),
    week: null,
    weekTasks: [],
    portion: p ? { ...p, refs: p.segments.map((s) => ({ s: s.s, from: s.from, to: s.to })) } : null,
    learnedToday,
    cfg,
    requiredMinutes: requiredMinutes(state, cfg),
    trial,
    progress: {
      acquiredParts: [...state.parts.values()].filter((x) => x.learnedDay !== null).length,
      totalParts: parts.length,
      pos: state.pos,
      total: seq.length,
    },
    events,
  };
}

/** Parts touchées par la portion du jour (événements « appris » à enregistrer). */
export function portionParts(meta: QuranMeta, plan: PlanRow, portion: Portion): string[] {
  const seq = learningSequence(meta, plan.suraOrder);
  return partsOverlapping(buildParts(meta, seq), portion.start, portion.end).map((p) => p.key);
}

export interface HifzSummary {
  plan: PlanRow;
  acquired: number;
  total: number;
  due: number;
  stopRule: boolean;
  lastNote: { total: number; mention: string; day: string } | null;
}

/** Résumé pour le suivi (parent : chaque enfant ; adulte : son profil). */
export async function hifzSummary(profileId: string): Promise<HifzSummary | null> {
  const data = await loadProfileHifz(profileId);
  if (!data?.plan) return null;
  const meta = await loadMeta();
  const pack =
    data.plan.mode === 'carnet' && data.plan.bookCode ? await loadBook(data.plan.bookCode) : null;
  const pending = await pendingHifz(profileId);
  const known = new Set(data.events.map((e) => e.id));
  const v = computeToday(
    data.plan,
    [...data.events, ...pending.filter((e) => !known.has(e.id))],
    meta,
    pack,
  );
  if (!v) return null;
  const last = [...data.events].reverse().find((e) => e.source === 'enseignant');
  const n = (last?.details as { note?: { total: number; mention: string } } | null)?.note;
  return {
    plan: data.plan,
    acquired: v.progress.acquiredParts,
    total: v.progress.totalParts,
    due: v.plan.recent.length + v.plan.manzil.length,
    stopRule: v.plan.stopRule,
    lastNote: n && last ? { ...n, day: last.day } : null,
  };
}

export { forecast };
