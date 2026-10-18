/**
 * Bêta fermée sur invitation (application) :
 *  - état d'accès du site donné par le serveur (`GET /api/v1/acces/statut` : mode fermé, sur invitation ou ouvert, inscription
 *    offerte — « attente » quand le plafond du mode ouvert est atteint —, vérification de l'adresse, anti-robots, bandeau
 *    bêta, administrateur connecté ou non), demandé une fois par chargement ;
 *  - bandeau « Version bêta » : fermable, fermeture retenue sur l'appareil (jusqu'à un changement de texte, voir
 *    `VERSION_BANDEAU`) ;
 *  - mode fermé : pages qui restent ouvertes (connexion de l'administrateur, administration, état du service) ;
 *  - adresse e-mail à vérifier avant d'utiliser le compte (`verification: 'requise'`).
 * Fonctions pures et testables ; le réseau et le stockage sont passés en paramètres.
 */
import { call } from './session';

export interface AccesStatut {
  mode: 'ferme' | 'invitation' | 'ouvert';
  inscription: 'ouverte' | 'invitation' | 'attente';
  site: 'ouvert' | 'ferme';
  bandeau: 'on' | 'off';
  verification: 'requise' | 'souple';
  antibot: 'on' | 'off';
  admin: boolean;
  /** 18/10/2026 : façons d'entrer offertes (interrupteurs du serveur) */
  google?: boolean;
  telephone?: boolean;
  telephoneEnvoi?: boolean;
  telephoneManuel?: boolean;
}

let courant: Promise<AccesStatut | null> | null = null;
/** État d'accès du site ; `null` si le serveur ne répond pas (hors ligne) : l'application reste utilisable. */
export function chargerStatut(force = false): Promise<AccesStatut | null> {
  if (!courant || force)
    courant = call<AccesStatut>('GET', '/acces/statut').then((r) => (r.ok ? r.data : null));
  return courant;
}

/** Texte du bandeau : un changement de texte le fait réapparaître chez ceux qui l'avaient fermé. */
export const VERSION_BANDEAU = '1';
export const CLE_BANDEAU = 'awzid.bandeau-beta';

export interface StockageSimple {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
export function bandeauFerme(s: StockageSimple | null): boolean {
  try {
    return s?.getItem(CLE_BANDEAU) === VERSION_BANDEAU;
  } catch {
    return false;
  }
}
export function fermerBandeau(s: StockageSimple | null): void {
  try {
    s?.setItem(CLE_BANDEAU, VERSION_BANDEAU);
  } catch {
    /* stockage indisponible : le bandeau reviendra à la prochaine ouverture */
  }
}
/** Le bandeau est-il à afficher ? (serveur injoignable ou réglage absent : oui, par prudence) */
export function bandeauAffiche(s: AccesStatut | null, stockage: StockageSimple | null): boolean {
  return (s?.bandeau ?? 'on') !== 'off' && !bandeauFerme(stockage);
}

/** Pages qui restent ouvertes quand le site est fermé (l'administrateur doit pouvoir se connecter et rouvrir). */
const OUVERTES_SI_FERME = /^\/(connexion|admin|acces|etat)(\/|$)/;
export function ouverteSiFerme(path: string): boolean {
  return OUVERTES_SI_FERME.test(path);
}
/** Faut-il montrer la page de maintenance à cette personne sur cette page ? */
export function maintenance(s: AccesStatut | null, path: string): boolean {
  return s?.site === 'ferme' && !s.admin && !ouverteSiFerme(path);
}

/** Pages ouvertes à un compte dont l'adresse n'est pas encore vérifiée. */
const OUVERTES_SI_NON_VERIFIE =
  /^\/(acces|connexion|inscription|legal|aide|garanties|compte)(\/|$)/;
/**
 * Une adresse à vérifier ferme l'application (hors compte, aide et pages légales) tant que le lien n'a pas été ouvert :
 * renvoie la page de vérification, ou null.
 */
export function pageDeVerification(
  s: AccesStatut | null,
  emailVerifie: boolean | undefined,
  genre: string | undefined,
  path: string,
): string | null {
  if (s?.verification !== 'requise') return null;
  if (emailVerifie !== false) return null;
  if (genre !== 'parent' && genre !== 'adulte') return null;
  return OUVERTES_SI_NON_VERIFIE.test(path) ? null : '/acces/verification';
}

/** Pages ouvertes à un visiteur non connecté quand la bêta est « sur invitation » (le reste de l'application est fermé). */
const ROUTES_VISITEUR = /^\/(connexion|inscription|acces|legal|aide|garanties|errata|etat)(\/|$)/;
/**
 * Bêta « sur invitation » : un visiteur non connecté ne voit que l'accueil de la bêta (présentation, code d'invitation, liste
 * d'attente, connexion) ; l'application et son contenu restent fermés (le serveur refuse aussi l'API aux anonymes).
 */
export function accueilVisiteur(s: AccesStatut | null, connecte: boolean, path: string): boolean {
  return (
    s?.mode === 'invitation' && s.site === 'ouvert' && !connecte && !ROUTES_VISITEUR.test(path)
  );
}
