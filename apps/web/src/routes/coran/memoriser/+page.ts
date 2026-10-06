import { redirect } from '@sveltejs/kit';
import { legacyQuery } from '$lib/quran/lecture';
import type { PageLoad } from './$types';

/** Coran épuré : ancienne adresse, redirigée vers l'écran de lecture unique (mêmes paramètres). */
export const load: PageLoad = ({ url }) => {
  const q = legacyQuery('memoriser', url.searchParams);
  redirect(307, `/coran/lecteur${q ? `?${q}` : ''}`);
};
