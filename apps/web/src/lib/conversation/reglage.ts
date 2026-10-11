/**
 * A26b — voix du partenaire de conversation (masculine ou féminine). Préparé dès la phase 1 : SANS EFFET tant
 * qu'il n'existe pas d'audio double (phase 3). Le parent peut FIXER le choix pour un enfant (verrou) : l'écran de
 * l'élève n'affiche alors plus le choix. Réglage de l'appareil (stockage local ; indisponible → défaut).
 */
export type Voix = 'f' | 'm';
export interface ConvReglage {
  voix: Voix;
  /** fixé par le parent */
  fixe: boolean;
}
const KEY = 'awzid.conversation';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function lireConversation(store: Store | null = safeStorage()): ConvReglage {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<ConvReglage> | null;
    return { voix: v?.voix === 'm' ? 'm' : 'f', fixe: v?.fixe === true };
  } catch {
    return { voix: 'f', fixe: false };
  }
}

export function ecrireConversation(r: ConvReglage, store: Store | null = safeStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ voix: r.voix === 'm' ? 'm' : 'f', fixe: !!r.fixe }));
  } catch {
    /* navigation privée : réglage pour cette visite seulement */
  }
}
