/**
 * Révision des mots des leçons en cartes (cahier § 2.5, MVP) : recto le mot arabe vocalisé (et son image),
 * verso le sens français ; JAMAIS de translittération. Boîtes de Leitner sur l'appareil (1, 2, 4, 8, 16
 * jours), hors ligne ; chaque réponse part dans la file commune (tableau de bord). FSRS viendra en V1.
 * Enfants E1-E2 : pas de cartes seules, un mini-jeu « relier » avec l'adulte, 5 minutes au plus.
 */
import { api, type UnitDetail } from './api';
import { enqueue } from './attempts';
import { localIso } from './hifz';
import { kvGet, kvSet } from './idb';
import { localUnit, localUnits } from './offline';
import type { ProfileInfo } from './session';

export interface Word {
  ar: string;
  fr: string;
  img?: string;
  unit: string;
}

export interface Deck {
  level: string;
  words: Word[];
  illustrations: Record<string, { viewBox: string; svg: string }>;
}

export const INTERVALS = [1, 2, 4, 8, 16] as const;

export function levelOf(p: ProfileInfo): string {
  return p.levelCode ?? (p.kind === 'adulte' ? 'ad1' : 'en1');
}

/** Mini-jeu pour les petits (E1, E2) plutôt que des cartes à retourner seuls. */
export function isYoung(p: ProfileInfo): boolean {
  return p.kind === 'enfant' && /^en[12]$/.test(levelOf(p));
}

/** Mots des leçons commencées (sinon des trois premières leçons du niveau). */
export async function loadDeck(p: ProfileInfo): Promise<Deck> {
  const level = levelOf(p);
  let ids: string[] = [];
  try {
    const r = await fetch(`/api/v1/progress?profile=${p.id}&level=${level}`);
    if (r.ok) {
      const body = (await r.json()) as { progress: Array<{ unitId: string; status: string }> };
      ids = body.progress.filter((x) => x.status !== 'ouverte').map((x) => x.unitId);
    }
  } catch {
    /* hors ligne : leçons de l'appareil */
  }
  const words: Word[] = [];
  const illustrations: Deck['illustrations'] = {};
  const add = (u: UnitDetail, ill: Deck['illustrations']) => {
    for (const m of (u.lesson as { mots?: Array<{ ar?: string; fr?: string; img?: string }> })
      .mots ?? [])
      if (m.ar && m.fr && !words.some((w) => w.ar === m.ar))
        words.push({ ar: m.ar, fr: m.fr, img: m.img, unit: u.id });
    Object.assign(illustrations, ill);
  };
  if (ids.length === 0) {
    const local = await localUnits(level);
    ids = (local.length ? local : []).filter((u) => u.n <= 3).map((u) => u.id);
    if (ids.length === 0) ids = [1, 2, 3].map((n) => `${level}.l${String(n).padStart(2, '0')}`);
  }
  for (const id of ids) {
    const local = await localUnit(id).catch(() => null);
    if (local) add(local.unit, local.illustrations);
    else
      try {
        const r = await api<{ unit: UnitDetail; illustrations: Deck['illustrations'] }>(
          fetch,
          `/units/${id}`,
        );
        add(r.unit, r.illustrations);
      } catch {
        /* leçon indisponible hors ligne */
      }
  }
  return { level, words, illustrations };
}

export type Boxes = Record<string, { box: number; due: string }>;

export async function loadBoxes(profileId: string): Promise<Boxes> {
  return ((await kvGet<Boxes>(`cards:${profileId}`).catch(() => undefined)) ?? {}) as Boxes;
}

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Cartes à revoir aujourd'hui (jamais vues ou échues), au plus `max`. */
export function dueWords(words: readonly Word[], boxes: Boxes, today: string, max = 12): Word[] {
  return words.filter((w) => !boxes[w.ar] || boxes[w.ar]!.due <= today).slice(0, max);
}

/** Nouvelle boîte après une réponse (su : boîte suivante ; à revoir : boîte 1, demain). */
export function nextBox(prev: { box: number } | undefined, ok: boolean, today: string) {
  const box = ok ? Math.min(INTERVALS.length, (prev?.box ?? 0) + 1) : 1;
  return { box, due: addDays(today, ok ? INTERVALS[box - 1]! : 1) };
}

export async function answer(
  profileId: string,
  boxes: Boxes,
  w: Word,
  ok: boolean,
): Promise<Boxes> {
  const today = localIso();
  const next = { ...boxes, [w.ar]: nextBox(boxes[w.ar], ok, today) };
  await kvSet(`cards:${profileId}`, next).catch(() => {});
  await enqueue({
    profileId,
    unitId: 'entrainement',
    eventType: 'carte',
    response: { item: w.ar, ok, day: today, details: { boite: next[w.ar]!.box, lecon: w.unit } },
  });
  return next;
}
