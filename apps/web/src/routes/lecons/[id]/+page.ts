import { api, type UnitDetail } from '$lib/api';
import { localUnit } from '$lib/offline';
import { maskLocal } from '$lib/signaler';
import type { PageLoad } from './$types';

/**
 * Leçon : depuis l'appareil si son niveau est téléchargé (aucun octet sur le réseau), sinon le réseau.
 * Lot F1 : l'édition du contenu affiché accompagne chaque réponse ; une leçon gardée hors ligne reçoit les
 * suspensions d'urgence connues (même masque que le serveur).
 */
export const load: PageLoad = async ({ fetch, params }) => {
  const local = await localUnit(params.id).catch(() => null);
  if (local)
    return {
      edition: local.unit.edition ?? '',
      ...local,
      unit: await maskLocal(local.unit),
      local: true,
    };
  const r = await api<{
    edition: string;
    unit: UnitDetail;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }>(fetch, `/units/${encodeURIComponent(params.id)}`);
  return { ...r, local: false };
};
