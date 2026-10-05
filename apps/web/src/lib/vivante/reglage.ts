/**
 * Chantier A21 — réglage des « leçons vivantes » (animations après chaque partie d'une leçon et condensé) :
 * réglage de confort propre à l'appareil, comme le mode clair/sombre (stockage local ; indisponible → défaut).
 *  - interrupteur général (activé par défaut) ;
 *  - activées d'office sur les trois leçons pilotes ; activables pour tout un niveau.
 */
export const PILOTES = ['en1.l01', 'ado1.l01', 'ad1.l01'] as const;
/** niveaux d'arabe qui peuvent être rendus vivants (enfants, ados, adultes) */
export const VIV_LEVEL = /^(en|ado|ad)\d+$/;
const KEY = 'awzid.vivante';

export interface VivReglage {
  /** interrupteur général */
  on: boolean;
  /** niveaux entièrement activés */
  levels: string[];
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
      levels: Array.isArray(v?.levels) ? v.levels.filter((l) => VIV_LEVEL.test(String(l))) : [],
    };
  } catch {
    return { on: true, levels: [] };
  }
}

export function writeVivante(r: VivReglage, store: Store | null = safeStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ on: r.on, levels: [...new Set(r.levels)].sort() }));
  } catch {
    /* navigation privée : réglage pour cette visite seulement */
  }
}

/** La leçon est-elle vivante ? (leçon d'arabe seulement ; pilotes, ou niveau activé) */
export function vivanteActive(
  unitId: string,
  level: string,
  r: VivReglage = readVivante(),
): boolean {
  if (!r.on || !VIV_LEVEL.test(level)) return false;
  return (PILOTES as readonly string[]).includes(unitId) || r.levels.includes(level);
}
