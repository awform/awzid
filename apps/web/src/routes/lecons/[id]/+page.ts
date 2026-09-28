import { api, type UnitDetail } from '$lib/api';
import { localUnit } from '$lib/offline';
import type { PageLoad } from './$types';

/** Leçon : depuis l'appareil si son niveau est téléchargé (aucun octet sur le réseau), sinon le réseau. */
export const load: PageLoad = async ({ fetch, params }) => {
  const local = await localUnit(params.id).catch(() => null);
  if (local) return { edition: '', ...local, local: true };
  const r = await api<{
    edition: string;
    unit: UnitDetail;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }>(fetch, `/units/${encodeURIComponent(params.id)}`);
  return { ...r, local: false };
};
