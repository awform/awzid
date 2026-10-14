/**
 * Madjaliss — mémorisation d'une phrase avec le moteur du hifẓ (`hifz-outils/outils`) : amorce (premiers mots,
 * `amorce`), masquage PROGRESSIF (rien, un mot sur deux après l'amorce, tout sauf l'amorce, tout), auto-évaluation
 * juste / hésitant / oublié (`AUTO_EVALS`) notée comme au hifẓ (`QUALITE`, 0 à 3) et répétition (« oublié » : la
 * phrase revient en fin de séance). Le moteur est chargé À LA DEMANDE à l'étape « Mémoriser » : importé ici
 * directement, il serait partagé par trois pages et partirait dans le morceau commun que chargent TOUTES les pages.
 * Le texte n'est jamais modifié : seulement le rang des mots dans `texte.split(' ')`. Pas de voix de synthèse.
 */
import type { AutoEval } from '$lib/hifz-outils/outils';
import { kvGet, kvSet } from '$lib/idb';

export type { AutoEval };
export type Moteur = typeof import('$lib/hifz-outils/outils');
export const chargerMoteur = (): Promise<Moteur> => import('$lib/hifz-outils/outils');

/**
 * Phrases proposées à la mémorisation (décision du référent, 12/10) : le matn seulement (type « texte »), sans
 * formule, basmala, titre ni citation, jamais un passage réservé ; jusqu'à la liste des passages choisis.
 */
export const aMemoriser = <
  P extends { t: string; ar?: unknown; h?: unknown; explication?: true; masque?: true; nc?: true },
>(
  ps: readonly P[],
) =>
  ps.filter(
    (p) =>
      (p.t === 'texte' || p.t === 'vers') &&
      !p.explication &&
      !p.masque &&
      !p.nc &&
      (typeof p.ar === 'string' || !!p.h),
  );

/** Paliers de masquage : 0 (tout visible) à 3 (tout masqué). */
export const PALIERS = 4;

export const motsDe = (ar: string): string[] => ar.split(' ');

/** Mots masqués au palier donné (rang dans `ar.split(' ')`), à partir de l'amorce du hifẓ. */
export function masques(nMots: number, palier: number, amorce: (n: number) => number): boolean[] {
  const a = amorce(nMots);
  return Array.from({ length: nMots }, (_, i) =>
    palier <= 0 ? false : palier === 1 ? i >= a && (i - a) % 2 === 1 : palier === 2 ? i >= a : true,
  );
}

/** Dernière récitation d'une phrase : note du hifẓ (0 à 3), jour, nombre de récitations. */
export interface Recitation {
  q: number;
  jour: string;
  fois: number;
}
export type Carnet = Record<string, Recitation>;
const cle = (pid: string | null, texte: string) => `madjaliss-memo:${pid ?? 'appareil'}:${texte}`;

export async function lireCarnet(pid: string | null, texte: string): Promise<Carnet> {
  return (await kvGet<Carnet>(cle(pid, texte)).catch(() => undefined)) ?? {};
}

export async function noter(
  pid: string | null,
  texte: string,
  phrase: string,
  e: AutoEval,
  jour: string,
): Promise<Carnet> {
  const { QUALITE } = await chargerMoteur();
  const c = await lireCarnet(pid, texte);
  const next = { ...c, [phrase]: { q: QUALITE[e], jour, fois: (c[phrase]?.fois ?? 0) + 1 } };
  await kvSet(cle(pid, texte), next).catch(() => {});
  return next;
}

/** Oublié : la phrase revient à la fin de la file de la séance (répétition). */
export function apresEval<T>(file: readonly T[], e: AutoEval): T[] {
  const [tete, ...reste] = file;
  return e === 'oublie' && tete !== undefined ? [...reste, tete] : reste;
}
