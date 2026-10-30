/**
 * V2-3 : interface d'un enfant connecté par identifiant (`me.enfantSession`, session limitée à son profil).
 * Aucun lien ne doit mener à une page qui appelle une route refusée à cette session (réglages, profils, compte,
 * paiements, accords, famille, école, messages, récitation / écoute, tuteur).
 */
import type { NavItem } from '$lib/ui/audience';

/** pages fermées à l'enfant (elles appellent des routes que la session limitée refuse) */
const PAGES_FERMEES =
  /^\/(compte|profils|abonnement|offres|famille|acces|activation|ecole|enseignant|admin|messages|inscription|beta|ma-classe|plus|recital|suivi|tuteur|cahier-parler|coran\/ecouter)(\/|$)/;

export const pageOuverteAEnfant = (chemin: string): boolean => !PAGES_FERMEES.test(chemin);

/** entrées de navigation gardées pour un enfant : celles dont la page lui est ouverte */
export const navPourEnfant = (nav: NavItem[]): NavItem[] =>
  nav.filter((x) => pageOuverteAEnfant(x.href));
