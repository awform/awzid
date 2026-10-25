import { replaceState } from '$app/navigation';
import { resolve } from '$app/paths';

/**
 * Met à jour la requête de la page du parcours (`?e=pas&i=3`) sans la recharger ni empiler l'historique : l'adresse
 * montre l'étape, le retour arrière revient à l'écran précédent.
 */
export function remplacerRequete(requete: string): void {
  // l'adresse est résolue ici même : la page du parcours
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- adresse construite avec resolve()
  replaceState(`${resolve('/vivre/priere')}?${requete}`, {});
}
