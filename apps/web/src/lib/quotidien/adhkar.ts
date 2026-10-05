/**
 * A12 — adhkār tirés des livres (route publique /api/v1/adhkar) : gardés sur l'appareil (IndexedDB) pour le
 * hors ligne ; les versets des récitations (Tanzil) sont gardés par loadVerses comme dans l'espace Coran.
 */
import type { AdhkarCategory, AdhkarItem } from '@awform/content/adhkar';
import { kvGet, kvSet } from '$lib/idb';

export type { AdhkarCategory, AdhkarItem };
export interface AdhkarData {
  edition: string;
  categories: Array<{ id: AdhkarCategory; items: AdhkarItem[] }>;
  missing: string[];
}
const KV = 'adhkar.v1';

/** Réseau d'abord (contenu de l'édition publiée), sinon dernière copie gardée sur l'appareil. */
export async function loadAdhkar(): Promise<{ data: AdhkarData | null; offline: boolean }> {
  try {
    const r = await fetch('/api/v1/adhkar', { signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const data = (await r.json()) as AdhkarData;
      await kvSet(KV, data).catch(() => {});
      return { data, offline: false };
    }
  } catch {
    /* hors ligne : copie locale */
  }
  const data = (await kvGet<AdhkarData>(KV).catch(() => undefined)) ?? null;
  return { data, offline: true };
}

/** Lien vers la leçon d'origine (« re3.l05 » → /lecons/re3.l05). */
export const lessonHref = (unit: string) => `/lecons/${unit}`;
