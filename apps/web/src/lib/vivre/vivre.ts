/**
 * A37 — « Vivre l'islam », bon comportement (côté application) : catalogue public des rubriques et des fiches
 * (gardé sur l'appareil pour le hors ligne) et leçons atteintes de l'élève actif. Le filtrage par âge et par
 * niveau est fait ici, par les fonctions pures de `@awform/content/adab` (testées).
 */
import type { AdabEntry, Fiche, Kind, Learner } from '@awform/content/adab';
import { kvGet, kvSet } from '$lib/idb';
import { call } from '$lib/session';

export type { AdabEntry, Fiche, Kind, Learner };
export interface Catalogue {
  edition: string;
  rangement: 'index' | 'auto';
  entrees: AdabEntry[];
  fiches: Fiche[];
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
