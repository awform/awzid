/**
 * Carnets de hifẓ des niveaux (data/hifz/<code>.js, E1 et N1 pour le MVP) : 30 semaines, portions par
 * semaine (nouveau « n » ou récitation de révision « r »), parts de la roue (une sourate ou un passage),
 * durées du carnet. Le carnet reste la référence : l'application ne réordonne rien.
 */
import { pagesOf, suraName, type QuranMeta } from './quran.js';
import type { EngineConfig, PartInfo } from './engine.js';

export interface BookPortion {
  s: number;
  v: string;
  t?: 'r';
  l?: string;
}
export interface BookEntry {
  sourate: number;
  versets: string;
  nb?: number;
  nom_fr?: string;
  lecon_fr?: string;
  semaines?: string;
  portions: BookPortion[];
}
export interface HifzBookData {
  code: string;
  filiere?: string;
  niveau_fr?: string;
  semaines: number;
  parcours: { socle: BookEntry[]; renforce?: BookEntry[] };
  manzil_parts?: number;
  duree_fr?: string;
  jalon_fr?: string;
  recital_fr?: string;
  revision_fr?: string;
  mutashabihat?: Array<{ a: string; b: string; note_fr?: string }>;
  talqin?: boolean;
}

/** Durées du carnet commun (total, nouveau) en minutes, par niveau. */
const DUREES: Record<string, [number, number]> = {
  en1: [10, 3],
  en2: [10, 3],
  en3: [15, 5],
  en4: [15, 5],
  en5: [20, 7],
  ad1: [17.5, 5],
  ad2: [17.5, 5],
};

export function bookConfig(book: HifzBookData): EngineConfig {
  const [total, nouveau] = DUREES[book.code] ?? [20, 5];
  return { dailyMinutes: total, newMinutes: nouveau, cycle: book.manzil_parts ?? 3 };
}

/** Versets « 1-4 », « 255 », « 285-286 » → [de, à]. */
export function verseRange(v: string): [number, number] {
  const m = /^(\d+)(?:-(\d+))?$/.exec(v.trim());
  if (!m) throw new Error(`versets illisibles : ${v}`);
  const a = Number(m[1]);
  return [a, Number(m[2] ?? a)];
}

/** Clé d'une part : « 112:1-4 », « 2:255 ». */
export function entryKey(e: Pick<BookEntry, 'sourate' | 'versets'>): string {
  return `${e.sourate}:${e.versets}`;
}

export interface BookPart extends PartInfo {
  sura: number;
  from: number;
  to: number;
  label: string;
  track: 'socle' | 'renforce';
}

export function bookParts(book: HifzBookData, meta: QuranMeta): BookPart[] {
  const twins = new Set<number>();
  for (const m of book.mutashabihat ?? [])
    for (const r of [m.a, m.b]) twins.add(Number(r.split(':')[0]));
  const out: BookPart[] = [];
  const add = (e: BookEntry, track: BookPart['track']) => {
    const [from, to] = verseRange(e.versets);
    let w = 0;
    for (let a = from; a <= to; a++) w += meta.weights[e.sourate - 1]?.[a - 1] ?? 0;
    out.push({
      key: entryKey(e),
      pages: pagesOf(meta, w),
      twin: twins.has(e.sourate),
      sura: e.sourate,
      from,
      to,
      label: e.nom_fr ?? suraName(e.sourate),
      track,
    });
  };
  for (const e of book.parcours.socle) add(e, 'socle');
  for (const e of book.parcours.renforce ?? []) add(e, 'renforce');
  return out;
}

export interface WeekTask {
  part: string;
  sura: number;
  from: number;
  to: number;
  kind: 'nouveau' | 'recitation';
  label: string;
  track: 'socle' | 'renforce';
}

/** Tâches de la semaine `week` (1 à 30). */
export function weekTasks(book: HifzBookData, week: number): WeekTask[] {
  const out: WeekTask[] = [];
  const scan = (list: BookEntry[] | undefined, track: WeekTask['track']) => {
    for (const e of list ?? [])
      for (const p of e.portions)
        if (p.s === week) {
          const [from, to] = verseRange(p.v);
          out.push({
            part: entryKey(e),
            sura: e.sourate,
            from,
            to,
            kind: p.t === 'r' ? 'recitation' : 'nouveau',
            label: p.l ?? '',
            track,
          });
        }
  };
  scan(book.parcours.socle, 'socle');
  scan(book.parcours.renforce, 'renforce');
  return out;
}

/** Semaine du carnet (1 à `semaines`) à une date, depuis le début du carnet. */
export function weekOf(book: HifzBookData, startDay: number, day: number): number {
  return Math.min(book.semaines, Math.max(1, Math.floor((day - startDay) / 7) + 1));
}

/** Tous les versets cités par un carnet (pour le paquet hors ligne), « s:a ». */
export function bookVerseRefs(book: HifzBookData): string[] {
  const refs = new Set<string>();
  for (const e of [...book.parcours.socle, ...(book.parcours.renforce ?? [])]) {
    const [from, to] = verseRange(e.versets);
    for (let a = from; a <= to; a++) refs.add(`${e.sourate}:${a}`);
  }
  return [...refs];
}
