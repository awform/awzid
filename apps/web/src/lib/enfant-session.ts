/**
 * V2-3 : interface d'un enfant ou d'un ado connecté par identifiant (`me.enfantSession`, session limitée à son
 * profil). Aucun lien ne doit mener à une page qui appelle une route refusée à cette session (réglages, profils,
 * compte, paiements, accords, famille, école, messages, tuteur). L'ado garde « Plus » (écriture, révisions,
 * lectures…) ; l'enfant garde la version épurée.
 */
import { fonctionsEtat } from '$lib/fonctions.svelte';
import type { NavItem } from '$lib/ui/audience';

/** pages fermées à l'enfant ET à l'ado (elles appellent des routes que la session limitée refuse) */
const PAGES_FERMEES =
  /^\/(compte|profils|abonnement|offres|famille|acces|activation|ecole|enseignant|admin|messages|inscription|beta|ma-classe|recital|suivi|cahier-parler)(\/|$)/;
/** fermées à l'enfant seulement : « Plus » et ce qu'il range */
const PAGES_FERMEES_ENFANT = /^\/plus(\/|$)/;

export const pageOuverteAEnfant = (chemin: string, ado = false): boolean =>
  !PAGES_FERMEES.test(chemin) && (ado || !PAGES_FERMEES_ENFANT.test(chemin));

/** entrées de navigation gardées : celles dont la page est ouverte à ce public */
export const navPourEnfant = (nav: NavItem[], ado = false): NavItem[] =>
  nav.filter((x) => pageOuverteAEnfant(x.href, ado));

/** Ce lien peut-il s'afficher ? Toujours hors session limitée ; sinon seulement vers une page ouverte à ce public. */
export const lienOuvert = (href: string): boolean =>
  !fonctionsEtat.restreint || pageOuverteAEnfant(href, fonctionsEtat.ado);
