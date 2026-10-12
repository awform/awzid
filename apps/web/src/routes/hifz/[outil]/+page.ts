import { error } from '@sveltejs/kit';
import { OUTILS, type Outil } from '$lib/hifz-outils/liste';
import type { PageLoad } from './$types';

/** Hifẓ complet : un écran par outil (test au hasard, points faibles, fraîcheur, deux rakʿa, écran enfant). */
export const load: PageLoad = ({ params }) => {
  if (!(OUTILS as readonly string[]).includes(params.outil)) error(404, 'introuvable');
  return { outil: params.outil as Outil };
};
