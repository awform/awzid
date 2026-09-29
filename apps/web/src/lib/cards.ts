/**
 * Révision des mots des leçons en cartes (cahier § 2.5, MVP) : recto le mot arabe vocalisé (et son image),
 * verso le sens français ; JAMAIS de translittération. Planification FSRS-5 sur l'appareil (lot 15, remplace les
 * boîtes de Leitner, migrées sans perte), hors ligne ; chaque réponse part dans la file commune (tableau de bord).
 * Enfants E1-E2 : pas de cartes seules, un mini-jeu « relier » avec l'adulte, 5 minutes au plus.
 */
import { api, type UnitDetail } from './api';
import { enqueue } from './attempts';
import { localIso } from './hifz';
import { fromLeitner, isLeitner, review, type CardState } from './fsrs';
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

/** État FSRS de chaque carte (clé : le mot arabe tel qu'écrit dans le livre). */
export type Boxes = Record<string, CardState>;

/** Lit les états ; un ancien état Leitner ({ box, due }) est converti en FSRS et réenregistré. */
export async function loadBoxes(profileId: string): Promise<Boxes> {
  const raw = ((await kvGet<Record<string, unknown>>(`cards:${profileId}`).catch(
    () => undefined,
  )) ?? {}) as Record<string, unknown>;
  const { boxes, migrated } = migrateBoxes(raw);
  if (migrated) await kvSet(`cards:${profileId}`, boxes).catch(() => {});
  return boxes;
}

export function migrateBoxes(raw: Record<string, unknown>): { boxes: Boxes; migrated: number } {
  const boxes: Boxes = {};
  let migrated = 0;
  for (const [k, v] of Object.entries(raw))
    if (isLeitner(v)) {
      boxes[k] = fromLeitner(v);
      migrated++;
    } else if (v && typeof v === 'object' && 's' in v) boxes[k] = v as CardState;
  return { boxes, migrated };
}

export { addDays } from './fsrs';

/** Cartes à revoir aujourd'hui (jamais vues ou échues, les plus en retard d'abord), au plus `max`. */
export function dueWords(words: readonly Word[], boxes: Boxes, today: string, max = 12): Word[] {
  const due = words.filter((w) => !boxes[w.ar] || boxes[w.ar]!.due <= today);
  return due
    .map((w, i) => ({ w, i, k: boxes[w.ar]?.due ?? '9999' }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.w)
    .slice(0, max);
}

export async function answer(
  profileId: string,
  boxes: Boxes,
  w: Word,
  ok: boolean,
): Promise<Boxes> {
  const today = localIso();
  const st = review(boxes[w.ar], ok ? 3 : 1, today);
  const next = { ...boxes, [w.ar]: st };
  await kvSet(`cards:${profileId}`, next).catch(() => {});
  await enqueue({
    profileId,
    unitId: 'entrainement',
    eventType: 'carte',
    response: {
      item: w.ar,
      ok,
      day: today,
      details: {
        fsrs: { stabilite: Math.round(st.s * 100) / 100, difficulte: Math.round(st.d * 100) / 100 },
        echeance: st.due,
        lecon: w.unit,
      },
    },
  });
  return next;
}
