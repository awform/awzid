/** V2-4 : règles de la bascule Moi / enfants (pures, testées), chargées à la demande avec la feuille. */
import type { ProfileInfo } from './session';

/** « Moi » d'abord, puis les enfants dans l'ordre reçu. */
export function profilsAffiches(profils: readonly ProfileInfo[]): ProfileInfo[] {
  return [...profils.filter((p) => p.isOwner), ...profils.filter((p) => !p.isOwner)];
}

/**
 * Règle actuelle, inchangée : avec un code parent, quitter le profil d'un enfant ou d'un ado (donc aussi y revenir
 * à l'espace parent) demande ce code ; sans code parent, ou depuis un profil d'adulte, le changement est libre.
 */
export function fautCodeParent(hasPin: boolean, actif: Pick<ProfileInfo, 'kind'> | null): boolean {
  return hasPin && !!actif && actif.kind !== 'adulte';
}
