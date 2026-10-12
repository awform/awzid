/**
 * Douas (phase 1) — données de l'onglet « Douas » de « Vivre l'islam » : fichier statique `/douas/douas.json`
 * (construit par scripts/douas.mjs depuis docs/projet/douas/ ; jamais dans le code), chargé À LA DEMANDE, gardé
 * sur l'appareil (IndexedDB) au premier usage pour le hors ligne. Favoris : sur l'appareil, par élève.
 * Le texte arabe est affiché tel quel : chaîne exacte du dossier (hadiths) ou de Tanzil (Coran).
 */
import { kvGet, kvSet } from '$lib/idb';

export interface Passage {
  s: number;
  a: number;
  /** sous-chaîne exacte du verset Tanzil */
  text: string;
}
export interface Doua {
  rubrique: string;
  titre: string;
  moment: string;
  /** texte arabe exact du dossier (hadith, parole de Compagnon) */
  ar?: string;
  /** douas du Coran : texte Tanzil, jamais de voix de synthèse */
  coran?: Passage[];
  reference: string;
  degre: string;
  juge_par: string;
  /** vide tant que la traduction n'est pas fournie (« Traduction en préparation ») */
  traduction: string;
  note?: string;
  /** parole d'un Compagnon (présentée comme telle) */
  compagnon?: string;
  /** ajout facultatif, affiché après la doua principale */
  facultatif?: boolean;
  /** emplacement de l'audio HUMAIN futur (aucun pour l'instant, aucun bouton) */
  audio: string | null;
}
export interface DouasData {
  v: number;
  edition: string;
  source_sha256: string;
  rubriques: Array<{ id: string; douas: string[] }>;
  enfant: string[];
  douas: Record<string, Doua>;
}

const KV = 'douas.v1';
export const DOUAS_URL = '/douas/douas.json';

/** Réseau d'abord (édition publiée), sinon la copie gardée sur l'appareil. */
export async function loadDouas(
  fetcher: typeof fetch = fetch,
): Promise<{ data: DouasData | null; offline: boolean }> {
  try {
    const r = await fetcher(DOUAS_URL, { signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const data = (await r.json()) as DouasData;
      await kvSet(KV, data).catch(() => {});
      return { data, offline: false };
    }
  } catch {
    /* hors ligne : copie locale */
  }
  const data = (await kvGet<DouasData>(KV).catch(() => undefined)) ?? null;
  return { data, offline: true };
}

/** Douas d'une rubrique (ordre du dossier ; un ajout facultatif suit la doua principale). */
export function inRubrique(data: DouasData, id: string): string[] {
  return data.rubriques.find((r) => r.id === id)?.douas.filter((d) => data.douas[d]) ?? [];
}

/** Version enfant : seulement la liste courte du quotidien (champ `enfant` des données). */
export function forChild(data: DouasData): string[] {
  return data.enfant.filter((d) => data.douas[d]);
}

/** Les deux crochets ornés du Coran, autour du texte Tanzil (le texte lui-même n'en contient pas). */
export const CROCHETS = { ouvre: '﴿', ferme: '﴾' } as const;

const favKey = (profile: string | null) => `douas.favoris.${profile ?? 'appareil'}`;

export async function loadFavorites(profile: string | null): Promise<string[]> {
  const v = await kvGet<string[]>(favKey(profile)).catch(() => undefined);
  return Array.isArray(v) ? v : [];
}

/** Ajoute ou retire un favori ; renvoie la nouvelle liste (gardée sur l'appareil). */
export async function toggleFavorite(
  profile: string | null,
  list: readonly string[],
  id: string,
): Promise<string[]> {
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  await kvSet(favKey(profile), next).catch(() => {});
  return next;
}
