/**
 * Chantiers A21 / A21b — réglage des « leçons vivantes » (animations après chaque partie d'une leçon et
 * condensé) : réglage de confort propre à l'appareil, comme le mode clair/sombre (stockage local ; indisponible
 * → défaut).
 *  - interrupteur général (activé par défaut) ;
 *  - A21b : activées PARTOUT par défaut (toutes les leçons des livres d'arabe) ; un niveau peut être désactivé.
 * Les leçons de religion (re, ra) et de lecture du Coran (qc) n'ont jamais d'animation.
 */
/** leçons pilotes du chantier A21 (démonstration) */
export const PILOTES = ['en1.l01', 'ado1.l01', 'ad1.l01'] as const;
/** niveaux d'arabe qui peuvent être rendus vivants (enfants, ados, adultes) */
export const VIV_LEVEL = /^(en|ado|ad)\d+$/;
const KEY = 'awzid.vivante';

export interface VivReglage {
  /** interrupteur général */
  on: boolean;
  /** niveaux où les animations sont désactivées */
  off: string[];
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readVivante(store: Store | null = safeStorage()): VivReglage {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<VivReglage> | null;
    return {
      on: v?.on !== false,
      // l'ancien réglage du pilote (`levels` activés) ne restreint plus rien : tout est actif par défaut
      off: Array.isArray(v?.off) ? v.off.filter((l) => VIV_LEVEL.test(String(l))) : [],
    };
  } catch {
    return { on: true, off: [] };
  }
}

export function writeVivante(r: VivReglage, store: Store | null = safeStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ on: r.on, off: [...new Set(r.off)].sort() }));
  } catch {
    /* navigation privée : réglage pour cette visite seulement */
  }
}

/** La leçon est-elle vivante ? (leçon d'arabe seulement ; interrupteur général, niveau non désactivé) */
export function vivanteActive(level: string, r: VivReglage = readVivante()): boolean {
  return r.on && VIV_LEVEL.test(level) && !r.off.includes(level);
}

/**
 * A21b — le code des leçons vivantes n'est pas dans la coquille : quand un niveau d'arabe est gardé pour le
 * hors ligne (et que ses animations sont actives), on le charge une fois pour que le service worker le garde.
 */
export function prechargerVivante(level: string): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !vivanteActive(level))
    return;
  void Promise.all([import('./installer'), import('./ModelesPlus.svelte')]).catch(() => undefined);
}
