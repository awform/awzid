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

/** Versets distincts des mots à revoir d'un bilan (pour « verset 3, verset 5 »). */
export function versetsARevoir(b: Bilan): number[] {
  return [...new Set(b.mots.map((m) => m[1]))].sort((x, y) => x - y);
}
