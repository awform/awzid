import { api, type UnitSummary } from '$lib/api';
import { localPack, localUnits } from '$lib/offline';
import type { PageLoad } from './$types';

/** Liste des leçons : depuis l'appareil si le niveau est téléchargé (hors ligne d'abord), sinon le réseau. */
export const load: PageLoad = async ({ fetch, params }) => {
  const pack = await localPack(params.code).catch(() => undefined);
  if (pack) {
    const units: UnitSummary[] = await localUnits(params.code);
    return { edition: pack.edition, level: params.code, units, local: true };
  }
  const r = await api<{ edition: string; level: string; units: UnitSummary[] }>(
    fetch,
    `/levels/${encodeURIComponent(params.code)}/units`,
  );
  return { ...r, local: false };
};
