/**
 * A26b — « Mes mots » : mots du livre gardés par l'élève depuis « Je parle » (texte du livre inchangé). Gardés
 * sur l'appareil ; les cartes de révision (cards.ts) les ajoutent au paquet du niveau.
 */
import { kvGet, kvSet } from '../idb';

export interface MotGarde {
  ar: string;
  fr: string;
  img?: string;
  unit: string;
}
const KEY = 'mesMots';

export async function mesMots(): Promise<MotGarde[]> {
  const v = await kvGet<MotGarde[]>(KEY).catch(() => undefined);
  return Array.isArray(v) ? v.filter((m) => m && typeof m.ar === 'string') : [];
}

/** Ajoute des mots (sans doublon) ; renvoie le nombre de mots nouveaux. */
export async function garderMots(mots: readonly MotGarde[]): Promise<number> {
  const deja = await mesMots();
  const neufs = mots.filter((m) => m.ar && m.fr && !deja.some((d) => d.ar === m.ar));
  if (neufs.length) await kvSet(KEY, [...deja, ...neufs]);
  return neufs.length;
}
