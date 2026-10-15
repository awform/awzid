/**
 * Lot 10 — bouton « Voir / Cacher la traduction » (décision du client du 15/10/2026), partagé par les lectures
 * graduées, les textes Madjaliss et les leçons des livres :
 *  - français affiché PAR DÉFAUT ; l'élève choisit ; le choix est MÉMORISÉ PAR PROFIL (sur l'appareil, comme le mode
 *    serein : aucune donnée envoyée) ;
 *  - le bouton ne cache que la traduction des textes et phrases arabes : consignes, explications de grammaire et notes
 *    restent en français (niveaux 1 à 6 compris) ;
 *  - examens et bilans `sans_traduction` : la traduction est déjà retirée par la projection de l'élève (rien à montrer :
 *    pas de bouton) ; la vue enseignant montre tout (le réglage ne s'y applique pas).
 * Stockage indisponible (navigation privée, aperçu) : défaut (traduction visible), jamais d'erreur.
 */
const KEY = 'awz-trad:';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function stockage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Clé du profil (« _ » : appareil sans profil choisi). */
const cle = (pid: string | null | undefined) => KEY + (pid || '_');

/** La traduction est-elle affichée pour ce profil ? (défaut : oui) */
export function traductionVisible(
  pid: string | null | undefined,
  store: Store | null = stockage(),
): boolean {
  try {
    return store?.getItem(cle(pid)) !== '0';
  } catch {
    return true;
  }
}

/** Mémorise le choix du profil. */
export function memoriserTraduction(
  pid: string | null | undefined,
  visible: boolean,
  store: Store | null = stockage(),
): void {
  try {
    store?.setItem(cle(pid), visible ? '1' : '0');
  } catch {
    /* stockage indisponible : choix pour cette visite seulement */
  }
}
