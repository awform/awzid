/**
 * Coran épuré (06/10/2026) — logique pure de l'écran de lecture unique (testée dans lecture.test.ts) :
 * préréglages d'écoute, plage écoutée, file de lecture, dernière lecture et signets gardés sur l'appareil,
 * débuts des ḥizb. Le texte coranique n'est jamais manipulé ici : seulement des références (sourate, verset).
 */
import { chainQueue, listenQueue, type ChainStep } from './player';

/** Onglets du sélecteur (puce « sourate · verset · page · juzʾ »). */
export type Onglet = 'sourate' | 'page' | 'juz' | 'hizb';

/** Réglages d'écoute concernés par un préréglage. */
export interface ListenSettings {
  repeatVerse: number;
  repeatRange: number;
  chain: boolean;
  repeatNew: number;
  repeatChain: number;
}

/**
 * Préréglages simples de la feuille « Réglages d'écoute ». `portee` : « suite » = du verset choisi à la fin de
 * la sourate ; « sourate » = toute la sourate ; « verset » = le verset choisi seul.
 */
export const PRESETS = [
  { id: 'simple', portee: 'suite', set: { repeatVerse: 1, repeatRange: 1, chain: false } },
  { id: 'verset3', portee: 'suite', set: { repeatVerse: 3, repeatRange: 1, chain: false } },
  { id: 'boucle', portee: 'sourate', set: { repeatVerse: 1, repeatRange: 20, chain: false } },
  { id: 'repeter', portee: 'verset', set: { repeatVerse: 20, repeatRange: 1, chain: false } },
  {
    id: 'memoriser',
    portee: 'suite',
    set: { repeatVerse: 1, repeatRange: 1, chain: true, repeatNew: 5, repeatChain: 2 },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  portee: 'suite' | 'sourate' | 'verset';
  set: Partial<ListenSettings>;
}>;
export type PresetId = (typeof PRESETS)[number]['id'];

/** Préréglage qui correspond aux réglages actuels (null : réglages personnalisés). */
export function presetOf(s: ListenSettings, range: Range | null, length: number): PresetId | null {
  for (const p of PRESETS) {
    const ok = Object.entries(p.set).every(([k, v]) => s[k as keyof ListenSettings] === v);
    if (!ok) continue;
    if (p.portee === 'verset' && !(range && range.from === range.to)) continue;
    if (p.portee === 'sourate' && !(range && range.from === 1 && range.to === length)) continue;
    return p.id;
  }
  return null;
}

export interface Range {
  s: number;
  from: number;
  to: number;
}

/** Plage d'un préréglage à partir du verset choisi `a` de la sourate `s` (n versets). */
export function presetRange(
  portee: 'suite' | 'sourate' | 'verset',
  s: number,
  a: number,
  n: number,
): Range {
  const x = Math.max(1, Math.min(n, a));
  if (portee === 'sourate') return { s, from: 1, to: n };
  if (portee === 'verset') return { s, from: x, to: x };
  return { s, from: x, to: n };
}

/** Plage bornée (du ≤ au, dans la sourate). */
export function clampRange(r: Range, n: number): Range {
  const from = Math.max(1, Math.min(n, Math.round(r.from) || 1));
  const to = Math.max(from, Math.min(n, Math.round(r.to) || from));
  return { s: r.s, from, to };
}

/** File de lecture et étapes (mémoriser) d'une plage selon les réglages. */
export function playQueue(
  r: Range,
  s: ListenSettings,
): { queue: number[]; steps: ChainStep[] | null } {
  if (s.chain) {
    const steps = chainQueue({
      from: r.from,
      to: r.to,
      repeatNew: s.repeatNew,
      repeatChain: s.repeatChain,
    });
    return { queue: steps.map((x) => x.aya), steps };
  }
  return {
    queue: listenQueue({
      from: r.from,
      to: r.to,
      repeatVerse: s.repeatVerse,
      repeatRange: s.repeatRange,
    }),
    steps: null,
  };
}

/** Débuts des 60 ḥizb (Ḥafṣ) : un ḥizb = quatre quarts (métadonnées Tanzil). */
export function hizbStart(
  quarters: readonly (readonly [number, number])[] | undefined,
  n: number,
): readonly [number, number] | null {
  return quarters?.[(n - 1) * 4] ?? null;
}

// —— dernière lecture et signets : gardés sur l'appareil, jamais envoyés ——
export interface Position {
  s: number;
  a: number;
  p: number;
  /** horodatage (ms) */
  t: number;
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const LAST = 'awzid.coran.derniere-lecture.v1';
const MARKS = 'awzid.coran.signets.v1';
const okPos = (x: unknown): x is Position => {
  const p = x as Position;
  return (
    !!p &&
    Number.isInteger(p.s) &&
    p.s >= 1 &&
    p.s <= 114 &&
    Number.isInteger(p.a) &&
    p.a >= 1 &&
    p.a <= 286 &&
    Number.isInteger(p.p) &&
    p.p >= 1 &&
    p.p <= 604
  );
};
export function readLast(store: Store | null = storage()): Position | null {
  try {
    const x = JSON.parse(store?.getItem(LAST) ?? 'null') as unknown;
    return okPos(x) ? x : null;
  } catch {
    return null;
  }
}
export function writeLast(
  p: Omit<Position, 't'>,
  store: Store | null = storage(),
  now = Date.now(),
) {
  try {
    store?.setItem(LAST, JSON.stringify({ s: p.s, a: p.a, p: p.p, t: now }));
  } catch {
    /* stockage indisponible */
  }
}
export function readMarks(store: Store | null = storage()): Position[] {
  try {
    const x = JSON.parse(store?.getItem(MARKS) ?? '[]') as unknown;
    return Array.isArray(x) ? x.filter(okPos).slice(0, 50) : [];
  } catch {
    return [];
  }
}
export const isMarked = (marks: readonly Position[], s: number, a: number) =>
  marks.some((m) => m.s === s && m.a === a);
/** Ajoute ou retire un signet ; renvoie la nouvelle liste (la plus récente d'abord, 50 au plus). */
export function toggleMark(
  pos: Omit<Position, 't'>,
  store: Store | null = storage(),
  now = Date.now(),
): Position[] {
  const cur = readMarks(store);
  const next = isMarked(cur, pos.s, pos.a)
    ? cur.filter((m) => !(m.s === pos.s && m.a === pos.a))
    : [{ s: pos.s, a: pos.a, p: pos.p, t: now }, ...cur].slice(0, 50);
  try {
    store?.setItem(MARKS, JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
  return next;
}

/**
 * Anciennes adresses (avant le Coran épuré) → l'écran de lecture unique, avec les mêmes paramètres :
 * `/coran/mushaf?page=&s=&a=&m=` (vue page), `/coran/ecouter?s=&a=&r=&m=` (écoute préparée, jamais lancée),
 * `/coran/memoriser` (mémoriser, portion du carnet). Les liens des leçons et des livres restent valables.
 */
export function legacyQuery(kind: 'mushaf' | 'ecouter' | 'memoriser', q: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of ['s', 'a', 'page', 'm', 'r']) {
    const v = q.get(k);
    if (v && /^[\w-]{1,24}$/.test(v)) out.set(k, v);
  }
  if (kind === 'mushaf') out.set('vue', 'page');
  if (kind === 'ecouter') out.set('ecoute', '1');
  if (kind === 'memoriser') out.set('memo', '1');
  return out.toString();
}

/** Nom abrégé d'un récitateur pour la mini-barre (« Muḥammad Ayyūb » → « M. Ayyūb »). */
export function shortName(name: string): string {
  const parts = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/);
  if (parts.length < 2 || name.length <= 14) return name;
  const last = parts[parts.length - 1]!;
  const initial = /[\p{Lu}\p{Ll}]/u.exec(parts[0]!)?.[0] ?? '';
  return initial ? `${initial}. ${last}` : last;
}
