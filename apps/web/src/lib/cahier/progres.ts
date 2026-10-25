/**
 * Cahier de lecture (20/10/2026) — progression gardée SUR L'APPAREIL (IndexedDB, par profil) : les 6 cases de chaque
 * page (3 lectures avec le modèle, 3 seul), les bilans à froid, les minutes de lecture et l'atelier.
 */
import { kvGet, kvSet } from '$lib/idb';

export interface PageProgres {
  /** 6 cases : 0-2 avec le modèle, 3-5 seul */
  cases: boolean[];
  /** date de la dernière ouverture (ISO) */
  vu?: string;
}
export interface BilanResultat {
  date: string;
  justes: number;
  total: number;
  reussi: boolean;
  /** indices des mots manqués (dans l'ordre de la page) */
  manques: number[];
  /** texte de l'épreuve finale : mots justes par minute */
  mpm?: number;
}
export interface MinuteResultat {
  date: string;
  /** éléments (ou mots) lus justes */
  justes: number;
  /** durée en secondes (60 pour une minute de lecture) */
  secondes: number;
}
/** Meilleur résultat d'un jeu de fin de grille ou d'un défi (cahiers des enfants et des ados). */
export interface JeuResultat {
  /** parties terminées */
  parties: number;
  /** meilleure médaille : 0 aucune, 1 bronze, 2 argent, 3 or (les enfants : 3 = étoile, jamais de médaille) */
  med: number;
  /** meilleur score (points) ou meilleur temps (secondes, défi chrono) */
  meilleur?: number;
  date?: string;
}
export interface ProgresCahier {
  pages: Record<string, PageProgres>;
  bilans: Record<string, BilanResultat[]>;
  minutes: Record<string, MinuteResultat[]>;
  /** mots de l'atelier réussis, par page */
  atelier: Record<string, number>;
  /** jeux de fin de grille et défis : clé `<page>:<jeu>` (construis, trouve, chrono, duel, colorie, defi) */
  jeux: Record<string, JeuResultat>;
}

export const cleProgres = (niveau: string, profil: string | null | undefined) =>
  `cahier:${niveau}:${profil || 'appareil'}`;

export const progresVide = (): ProgresCahier => ({
  pages: {},
  bilans: {},
  minutes: {},
  atelier: {},
  jeux: {},
});

/** Enregistre une partie : garde la meilleure médaille et le meilleur résultat (`moinsEstMieux` : un temps). */
export function enregistrerJeu(
  p: ProgresCahier,
  cle: string,
  med: number,
  valeur?: number,
  moinsEstMieux = false,
): ProgresCahier {
  const a = p.jeux[cle];
  const meilleur =
    valeur === undefined
      ? a?.meilleur
      : a?.meilleur === undefined
        ? valeur
        : moinsEstMieux
          ? Math.min(a.meilleur, valeur)
          : Math.max(a.meilleur, valeur);
  const r: JeuResultat = {
    parties: (a?.parties ?? 0) + 1,
    med: Math.max(a?.med ?? 0, med),
    date: new Date().toISOString(),
  };
  if (meilleur !== undefined) r.meilleur = meilleur;
  return { ...p, jeux: { ...p.jeux, [cle]: r } };
}

export async function lireProgres(
  niveau: string,
  profil: string | null | undefined,
): Promise<ProgresCahier> {
  const p = await kvGet<ProgresCahier>(cleProgres(niveau, profil)).catch(() => undefined);
  return { ...progresVide(), ...(p ?? {}) };
}

export function ecrireProgres(
  niveau: string,
  profil: string | null | undefined,
  p: ProgresCahier,
): Promise<void> {
  return kvSet(cleProgres(niveau, profil), JSON.parse(JSON.stringify(p))).catch(() => {});
}

/** Page faite : ses 6 lectures cochées, ou un bilan passé, ou une minute mesurée. */
export function pageFaite(p: ProgresCahier, id: string): boolean {
  return (
    (p.pages[id]?.cases.filter(Boolean).length ?? 0) >= 6 ||
    !!p.bilans[id]?.length ||
    !!p.minutes[id]?.length
  );
}

/** Page du jour parmi les pages d'une leçon : la première qui n'est pas faite (sinon la dernière). */
export function pageDuJour(nums: readonly number[], p: ProgresCahier): number | null {
  if (!nums.length) return null;
  return nums.find((n) => !pageFaite(p, idPage(n))) ?? nums[nums.length - 1]!;
}

export const idPage = (n: number) => `P${String(n).padStart(3, '0')}`;
