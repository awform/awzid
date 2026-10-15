/**
 * Douas (phases 1 à 3) — données de l'onglet « Douas » de « Vivre l'islam » : fichier statique `/douas/douas.json`
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
  /** panneau « Source » (table relue par le référent) : jamais de note interne du chercheur */
  /** lien : sunnah.com ou dorar.net (page du texte copié) */
  source: { recueil: string; degre?: string; juge?: string; lien?: string };
  /** hadith qui cite un verset (formulation du narrateur gardée) : « contient un passage du Coran » */
  coran_cite?: boolean;
  /** plusieurs formules dans une carte (lignes de `ar`) : moment de chacune (« En entrant », « En sortant ») */
  lignes?: string[];
  /** sens en français (traduit par Awzid depuis l'arabe, ou repris du livre) ; une ligne par formule */
  traduction: string;
  note?: string;
  /** parole d'un Compagnon (présentée comme telle) */
  compagnon?: string;
  /** ajout facultatif, affiché après la doua principale */
  facultatif?: boolean;
  /** voix de synthèse PROVISOIRE (hadiths seulement, jamais un verset) : chemin du MP3, sinon null */
  audio: string | null;
}
/** renvoi vers une doua d'une autre rubrique, ou vers les adhkār (sans dupliquer le texte) */
export type Renvoi = { doua: string } | { adhkar: string; titre: string; lien: string };
export interface FichePoint {
  texte: string;
  sources: Array<{ recueil: string; degre?: string; juge?: string; lien?: string }>;
}
export interface Fiche {
  titre: string;
  intro: string;
  sections: Array<{ titre: string; points: FichePoint[] }>;
  /** phase 3 : renvois internes vers les leçons de fiqh (zakāt des Madjaliss), sans recopier le texte */
  renvois?: Array<{ titre: string; lien: string }>;
}
export interface Rubrique {
  id: string;
  douas: string[];
  voir_aussi?: Renvoi[];
  /** phase 3 : points sourcés affichés avant les douas (Naissance n'a que ceux-là) */
  a_savoir?: FichePoint[];
  /** phase 3 : « Ce que nous n'ajoutons pas », avec la raison et la source lue */
  non_ajoute?: FichePoint[];
}
export interface DouasData {
  v: number;
  edition: string;
  source_sha256: string;
  source2_sha256?: string;
  /** architecture du référent : quotidien, moments de la vie, besoins, Coran */
  groupes?: Array<{ id: string; rubriques: string[] }>;
  source3_sha256?: string;
  rubriques: Rubrique[];
  /** fiches (pas des rubriques de douas) : « Comment invoquer » (en tête), « L'aumône » (en fin) */
  fiches?: Record<string, Fiche>;
  audio?: { mention: string; voix: string };
  enfant: string[];
  douas: Record<string, Doua>;
}

const KV = 'douas.v1';
/** pastille de la fiche « Comment invoquer » (pas une rubrique de douas) */
export const FICHE_INVOQUER = 'invoquer';
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

/** Groupe d'une rubrique (architecture du référent), null si les données n'en ont pas. */
export function groupOf(data: DouasData, rubrique: string): string | null {
  return data.groupes?.find((g) => g.rubriques.includes(rubrique))?.id ?? null;
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
