/**
 * Migration SILENCIEUSE des réglages d'apparence (décision du 11/10/2026 : thèmes « jardin », « nuit étoilée »,
 * « manuscrit » et palette « verdure » supprimés, une seule identité en clair et sombre).
 *
 *  - manuscrit          → mode clair + fond de lecture Sépia ;
 *  - nuit / nuit étoilée → mode sombre ;
 *  - jardin / verdure   → selon le téléphone (mode « auto ») ;
 *  - clair ou valeur inconnue → rien ne change.
 *
 * Un choix de mode fait à la main (clair / sombre) est toujours respecté ; un fond de lecture déjà choisi aussi.
 * Fonctions pures sur un stockage (testées dans migration.test.ts) : stockage indisponible ou contenu abîmé →
 * aucune erreur, réglages par défaut (jamais d'écran cassé).
 */
import type { Fond } from '$lib/quran/mushaf';

export type AncienTheme = 'jardin' | 'nuit' | 'manuscrit' | 'clair';
type ModeStocke = 'auto' | 'clair' | 'sombre';
type Magasin = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Drapeau « migration faite » (une seule fois par appareil). */
export const CLE_MIGRATION = 'awzid.themes.v2';
const CLE_MODE = 'awzid.mode';
const CLE_MUSHAF = 'awzid.mushaf.v1';
/** Anciennes clés (versions antérieures) : lues puis supprimées si elles existent. */
const CLES_ANCIENNES = ['awzid.theme', 'awzid.palette'] as const;
/** Traces d'un appareil déjà utilisé (écrites par l'élève, jamais automatiquement au premier affichage). */
const CLES_USAGE = [
  CLE_MODE,
  CLE_MUSHAF,
  'awzid.coran.derniere-lecture.v1',
  'awzid.coran.signets.v1',
  'awzid.riwaya-texte.v1',
  'awzid.tajwid',
  'awzid.vivante',
] as const;

/** Reconnaît un ancien nom de thème ou de palette (tolérant : accents, tirets, casse) ; `null` si inconnu. */
export function ancienTheme(valeur: unknown): AncienTheme | 'verdure' | null {
  if (typeof valeur !== 'string') return null;
  // pas de normalisation Unicode (interdite par le dépôt) : seuls les accents français utiles sont remplacés
  const v = valeur
    .toLowerCase()
    .replace(/[éèêë]/g, 'e')
    .trim();
  if (v === 'jardin' || v === 'garden') return 'jardin';
  if (v === 'manuscrit' || v === 'manuscript') return 'manuscrit';
  if (v === 'verdure') return 'verdure';
  if (v === 'clair') return 'clair';
  if (/^nuit|^night|^aube|etoil|starry/.test(v)) return 'nuit';
  return null;
}

/** Réglages obtenus pour un ancien thème, à partir du mode et du fond déjà enregistrés. */
export function apresMigration(
  ancien: AncienTheme | 'verdure' | null,
  mode: ModeStocke,
  fond: Fond | null,
): { mode: ModeStocke; fond: Fond | null } {
  const manuel = mode !== 'auto';
  switch (ancien) {
    case 'manuscrit':
      return { mode: manuel ? mode : 'clair', fond: fond ?? 'sepia' };
    case 'nuit':
      return { mode: manuel ? mode : 'sombre', fond };
    default:
      // jardin, verdure, clair, inconnu : le téléphone décide (mode « auto » inchangé)
      return { mode, fond };
  }
}

function lire(store: Magasin | null, cle: string): string | null {
  try {
    return store?.getItem(cle) ?? null;
  } catch {
    return null;
  }
}

/**
 * Appareil neuf : à appeler dès le premier affichage (avant que le lecteur ou un réglage n'écrive quoi que ce soit),
 * pour poser le drapeau tout de suite. Sans cela, un lecteur ouvert directement sur un appareil neuf écrivait ses
 * traces d'usage avant que le public de l'écran soit connu : la migration le prenait pour un ancien appareil
 * « manuscrit » et imposait le mode clair (le mode sombre du téléphone ne s'appliquait plus).
 */
export function marquerAppareilNeuf(store: Magasin | null): void {
  try {
    if (!store || lire(store, CLE_MIGRATION)) return;
    const ancienne = CLES_ANCIENNES.some((k) => ancienTheme(lire(store, k)) !== null);
    if (!ancienne && !CLES_USAGE.some((k) => lire(store, k) !== null))
      store.setItem(CLE_MIGRATION, '1');
  } catch {
    /* stockage indisponible : rien à faire */
  }
}

/**
 * Applique la migration une seule fois. `ancienParDefaut` : thème que le public de l'écran avait avant la
 * suppression (adulte → manuscrit…), utilisé quand aucune ancienne clé n'existe. Renvoie `true` si elle vient
 * d'être appliquée.
 */
export function migrerThemesSupprimes(
  store: Magasin | null,
  ancienParDefaut: AncienTheme,
): boolean {
  if (!store || lire(store, CLE_MIGRATION)) return false;
  try {
    const stocke = CLES_ANCIENNES.map((k) => ancienTheme(lire(store, k))).find((x) => x !== null);
    // Appareil neuf (aucune ancienne clé, aucun usage du lecteur ni de réglage de mode) : rien à migrer, le
    // téléphone décide ; on pose seulement le drapeau.
    if (!stocke && !CLES_USAGE.some((k) => lire(store, k) !== null)) {
      store.setItem(CLE_MIGRATION, '1');
      return false;
    }
    const ancien = stocke ?? ancienParDefaut;
    const m = lire(store, CLE_MODE);
    const mode: ModeStocke = m === 'clair' || m === 'sombre' ? m : 'auto';
    let prefs: Record<string, unknown> = {};
    try {
      const brut = JSON.parse(lire(store, CLE_MUSHAF) ?? '{}');
      if (brut && typeof brut === 'object' && !Array.isArray(brut)) prefs = brut;
    } catch {
      /* contenu abîmé : on repart des réglages par défaut du lecteur */
    }
    const fond: Fond | null = prefs.fond === 'sepia' || prefs.fond === 'ivoire' ? prefs.fond : null;
    const apres = apresMigration(ancien, mode, fond);
    if (apres.mode !== mode) {
      if (apres.mode === 'auto') store.removeItem(CLE_MODE);
      else store.setItem(CLE_MODE, apres.mode);
    }
    if (apres.fond && apres.fond !== fond) {
      store.setItem(CLE_MUSHAF, JSON.stringify({ ...prefs, fond: apres.fond }));
    }
    for (const k of CLES_ANCIENNES) store.removeItem(k);
    store.setItem(CLE_MIGRATION, '1');
    return true;
  } catch {
    // stockage plein ou bloqué : l'application reste utilisable avec les réglages par défaut
    return false;
  }
}
