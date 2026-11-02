import { api, type LevelSummary } from '$lib/api';
import type { PageLoad } from './$types';

/**
 * Mode « tout voir » : la liste PUBLIQUE de tous les niveaux de l'édition (aucune donnée d'élève). Le droit d'afficher
 * la page est lu dans la session (`toutVoir` de /auth/me) ; le contenu sensible, lui, reste gardé par le serveur.
 */
export const load: PageLoad = async ({ fetch }) => {
  const r = await api<{ edition: string; levels: LevelSummary[] }>(fetch, '/levels');
  return { edition: r.edition, levels: r.levels };
};
