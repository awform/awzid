import { api, type UnitSummary } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  return api<{ edition: string; level: string; units: UnitSummary[] }>(
    fetch,
    `/levels/${encodeURIComponent(params.code)}/units`,
  );
};
