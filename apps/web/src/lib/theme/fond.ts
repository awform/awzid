/**
 * Fond de lecture du lecteur du Coran (Ivoire par défaut, Sépia) : posé sur <html> (`data-fond`). Module minuscule,
 * sans dépendance : la mise en page l'appelle au démarrage sans charger le lecteur. Le Sépia n'agit qu'en mode
 * clair (voir tokens.css : les blocs du mode sombre l'emportent). Le choix est gardé avec les réglages du lecteur
 * (`awzid.mushaf.v1`, champ `fond`).
 */
import type { Fond } from '$lib/quran/mushaf';

const CLE = 'awzid.mushaf.v1';

export function stockageLocal(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Fond enregistré ; « ivoire » si rien, valeur inconnue ou stockage indisponible. */
export function lireFond(store: Pick<Storage, 'getItem'> | null = stockageLocal()): Fond {
  try {
    const brut = JSON.parse(store?.getItem(CLE) ?? '{}') as { fond?: unknown };
    return brut?.fond === 'sepia' ? 'sepia' : 'ivoire';
  } catch {
    return 'ivoire';
  }
}

/** Attribut `data-fond` : absent pour l'Ivoire (défaut). */
export function appliquerFond(f: Fond, el: HTMLElement = document.documentElement) {
  if (f === 'sepia') el.dataset.fond = 'sepia';
  else delete el.dataset.fond;
}
