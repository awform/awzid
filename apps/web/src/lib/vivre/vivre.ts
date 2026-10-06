/**
 * A37 — « Vivre l'islam », bon comportement (côté application) : catalogue public des rubriques et des fiches
 * (gardé sur l'appareil pour le hors ligne) et leçons atteintes de l'élève actif. Le filtrage par âge et par
 * niveau est fait ici, par les fonctions pures de `@awform/content/adab` (testées).
 */
import type { AdabEntry, Fiche, FicheResume, Kind, Learner } from '@awform/content/adab';
import { kvGet, kvSet } from '$lib/idb';
import { call } from '$lib/session';

export type { AdabEntry, Fiche, FicheResume, Kind, Learner };
export interface Catalogue {
  edition: string;
  rangement: 'index' | 'auto';
  entrees: AdabEntry[];
  fiches: FicheResume[];
}
const KV = 'vivre.v1';

/** Réseau d'abord (édition publiée), sinon dernière copie gardée sur l'appareil. */
export async function loadCatalogue(): Promise<{ data: Catalogue | null; offline: boolean }> {
  try {
    const r = await fetch('/api/v1/vivre', { signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const data = (await r.json()) as Catalogue;
      await kvSet(KV, data).catch(() => {});
      return { data, offline: false };
    }
  } catch {
    /* hors ligne : copie locale */
  }
  const data = (await kvGet<Catalogue>(KV).catch(() => undefined)) ?? null;
  return { data, offline: true };
}

/** Document public (réseau d'abord, copie sur l'appareil ensuite) ; null s'il n'existe pas ou hors ligne sans copie. */
async function cached<T>(path: string, key: string): Promise<T | null> {
  try {
    const r = await fetch(path, { signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const data = (await r.json()) as T;
      await kvSet(key, data).catch(() => {});
      return data;
    }
    if (r.status === 404) return null;
  } catch {
    /* hors ligne */
  }
  return (await kvGet<T>(key).catch(() => undefined)) ?? null;
}

/** Une fiche entière du livret « Bon comportement » (gardée sur l'appareil une fois ouverte). */
export const loadFiche = async (id: string) =>
  (
    await cached<{ fiche: Fiche }>(
      `/api/v1/vivre/fiches/${encodeURIComponent(id)}`,
      `vivre.fiche.${id}`,
    )
  )?.fiche ?? null;

/** Chapitre du guide des parents « Transmettre les valeurs » (gp.c18), s'il est publié. */
export const loadGuide = async () =>
  (await cached<{ chapitre: Record<string, unknown> }>('/api/v1/vivre/guide', 'vivre.guide'))
    ?.chapitre ?? null;

/**
 * Ce que voit un élève : son âge et ses leçons atteintes (réseau, sinon copie locale). Sans élève actif (visiteur,
 * parent qui découvre) : aucun filtre.
 */
export async function learnerOf(p: { id: string; kind: string } | null): Promise<Learner> {
  if (!p) return { kind: null, units: null };
  const kind = (['enfant', 'ado', 'adulte'].includes(p.kind) ? p.kind : 'adulte') as Kind;
  const key = `vivre.eleve.${p.id}`;
  const r = await call<{ kind: Kind; units: string[] }>('GET', `/profiles/${p.id}/vivre`);
  if (r.ok && r.data) {
    await kvSet(key, r.data.units).catch(() => {});
    return { kind: r.data.kind, units: new Set(r.data.units) };
  }
  const units = (await kvGet<string[]>(key).catch(() => undefined)) ?? [];
  return { kind, units: new Set(units) };
}

/** Bloc d'une leçon désigné par son chemin (« fiqh_adab », « rubriques.3 »). */
export function blockAt(lesson: unknown, path: string): Record<string, unknown> | null {
  let x: unknown = lesson;
  for (const k of path.split('.')) {
    if (!x || typeof x !== 'object') return null;
    x = (x as Record<string, unknown>)[k];
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Couleur de tuile (jetons existants, contrastes déjà contrôlés), tournante. */
export const TILE_TONES = ['primary-soft', 'ok-bg', 'info-bg', 'warn-bg', 'sand'] as const;
