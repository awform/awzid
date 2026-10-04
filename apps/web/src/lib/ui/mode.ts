/**
 * Lot 26 — mode d'affichage choisi sur l'appareil : « auto » (préférence du système), « clair », « sombre ».
 * Réglage de confort propre à l'appareil (stockage local ; s'il est indisponible : « auto »).
 */
export type Mode = 'auto' | 'clair' | 'sombre';
const KEY = 'awzid.mode';
export const MODES: Mode[] = ['auto', 'sombre', 'clair'];

export function readMode(store: Pick<Storage, 'getItem'> | null = safeStorage()): Mode {
  try {
    const v = store?.getItem(KEY);
    return v === 'clair' || v === 'sombre' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeMode(
  m: Mode,
  store: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage(),
) {
  try {
    if (m === 'auto') store?.removeItem(KEY);
    else store?.setItem(KEY, m);
  } catch {
    /* stockage indisponible (navigation privée) : réglage pour cette visite seulement */
  }
}

/** Mode suivant du bouton de l'en-tête : auto → sombre → clair → auto. */
export function nextMode(m: Mode): Mode {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length]!;
}

/** Attribut posé sur <html> : absent en « auto ». */
export function applyMode(m: Mode, el: HTMLElement = document.documentElement) {
  if (m === 'auto') delete el.dataset.mode;
  else el.dataset.mode = m;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
