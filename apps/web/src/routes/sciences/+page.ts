import { api, type LevelSummary } from '$lib/api';
import { localPacks } from '$lib/offline';
import type { PageLoad } from './$types';

/** Onglet « Sciences islamiques » : niveaux de religion ; sans réseau, ceux téléchargés sur l'appareil. */
export const load: PageLoad = async ({ fetch }) => {
  try {
    const r = await api<{ edition: string; levels: LevelSummary[] }>(fetch, '/levels');
    return { ...r, offline: false };
  } catch {
    const packs = await localPacks().catch(() => []);
    const levels: LevelSummary[] = packs.map((p) => ({
      code: p.level,
      track: '',
      rank: 0,
      titleFr: p.titleFr,
      codeFr: p.codeFr,
      niveauFr: null,
      titreAr: null,
      units: p.units.length,
    }));
    return { edition: packs[0]?.edition ?? '—', levels, offline: true };
  }
};
