/**
 * A5 — bilans des séances « Réciter et vérifier » gardés sur l'APPAREIL seulement (20 derniers) : versets
 * récités, mots à revoir (positions dans le texte, jamais l'audio ni ce que la machine a entendu). Le carnet de
 * hifẓ les reprend dans ses révisions (« À revoir »). Module léger (coquille) : pas de dépendance au panneau.
 */
import { kvGet, kvSet } from '$lib/idb';

export interface Bilan {
  date: string;
  s: number;
  from: number;
  to: number;
  /** versets récités (premier et dernier entendus) */
  versets: [number, number] | null;
  aRevoir: number;
  /** mots à revoir : sourate, verset, rang du mot dans le verset, type d'écart */
  mots: Array<[number, number, number, string]>;
  pasCompris: boolean;
  /** mode « devant le maître » : hésitations (reprises, longues pauses) et aide reçue (indices) — comptées à part, jamais des erreurs */
  maitre?: boolean;
  hesitations?: number;
  aide?: number;
}

const CLE = (profileId: string) => `ecoute.bilans:${profileId}`;

export async function bilans(profileId: string): Promise<Bilan[]> {
  return (await kvGet<Bilan[]>(CLE(profileId)).catch(() => undefined)) ?? [];
}

export async function garderBilan(profileId: string, b: Bilan): Promise<void> {
  const l = [b, ...(await bilans(profileId))].slice(0, 20);
  await kvSet(CLE(profileId), l).catch(() => {});
}

/** Passages à revoir pour le carnet : la DERNIÈRE séance de chaque portion, si elle a des mots à revoir. */
export function aRevoirDe(l: readonly Bilan[]): Bilan[] {
  const vus = new Set<string>();
  return l.filter((b) => {
    if (b.pasCompris) return false;
    const k = `${b.s}:${b.from}-${b.to}`;
    if (vus.has(k)) return false;
    vus.add(k);
    return b.aRevoir > 0;
  });
}

export interface StatsErreurs {
  /** séances comptées (hors « pas compris ») */
  seances: number;
  /** mots à revoir par type d'écart (oublie, remplace, ordre, ajoute, verset_saute) */
  parType: Record<string, number>;
  /** versets qui REVIENNENT : à revoir dans au moins 2 séances différentes, du plus fréquent au moins fréquent */
  recurrents: Array<{ s: number; a: number; seances: number }>;
}

/**
 * Historique des erreurs (comme le « suivi des erreurs » des applis de mémorisation) : types d'écart et versets qui
 * reviennent d'une séance à l'autre. Des COMPTES de mots, pas une note : seul le maître juge. Calculé sur les bilans
 * de l'appareil, jamais envoyé.
 */
export function statistiquesErreurs(l: readonly Bilan[]): StatsErreurs {
  const ok = l.filter((b) => !b.pasCompris);
  const parType: Record<string, number> = {};
  const parVerset = new Map<string, { s: number; a: number; seances: number }>();
  for (const b of ok) {
    const vus = new Set<string>();
    for (const [s, a, , type] of b.mots) {
      parType[type] = (parType[type] ?? 0) + 1;
      const k = `${s}:${a}`;
      if (vus.has(k)) continue;
      vus.add(k);
      const v = parVerset.get(k) ?? { s, a, seances: 0 };
      v.seances++;
      parVerset.set(k, v);
    }
  }
  const recurrents = [...parVerset.values()]
    .filter((v) => v.seances >= 2)
    .sort((x, y) => y.seances - x.seances || x.s - y.s || x.a - y.a);
  return { seances: ok.length, parType, recurrents };
}

/** Versets distincts des mots à revoir d'un bilan (pour « verset 3, verset 5 »). */
export function versetsARevoir(b: Bilan): number[] {
  return [...new Set(b.mots.map((m) => m[1]))].sort((x, y) => x - y);
}
