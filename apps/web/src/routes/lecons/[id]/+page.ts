import { api, type UnitDetail } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  return api<{
    edition: string;
    unit: UnitDetail;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }>(fetch, `/units/${encodeURIComponent(params.id)}`);
};
