import { api, type UnitDetail } from '$lib/api';
import { localUnit } from '$lib/offline';
import type { PageLoad } from './$types';

/** Mode projection (lot 18) : la leçon telle que l'élève la reçoit (projection élève), depuis l'appareil si
 *  son niveau est téléchargé (classe sans réseau), sinon le réseau. */
export const load: PageLoad = async ({ fetch, params }) => {
  const local = await localUnit(params.unit).catch(() => null);
  if (local) return { ...local };
  const r = await api<{
    unit: UnitDetail;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }>(fetch, `/units/${encodeURIComponent(params.unit)}`);
  return r;
};
