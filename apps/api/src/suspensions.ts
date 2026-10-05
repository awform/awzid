/**
 * Suspensions d'urgence appliquées au contenu servi (lot F1, revue M1) : leçon (`/units/:id`), paquets hors
 * ligne, page publique du QR code. Liste gardée 5 s en mémoire (vidée à chaque changement sur cette instance).
 * Une leçon masquée change d'empreinte (`sha256` + marque) : la mise à jour différentielle des appareils la
 * retélécharge ; l'appareil masque aussi ses copies grâce à `GET /api/v1/contenu/suspensions`.
 */
import { activeSuspensions, type Db } from '@awform/db';
import {
  applySuspensions,
  blockFingerprint,
  type MaskableUnit,
  type Suspension,
} from '@awform/content';

let cache: { at: number; list: Suspension[]; version: string } | null = null;
const TTL = 5_000;

export function invalidateSuspensions(): void {
  cache = null;
}

export async function currentSuspensions(db: Db): Promise<{ list: Suspension[]; version: string }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const rows = await activeSuspensions(db);
  const list = rows.map((r) => ({ unitId: r.unitId, path: r.path, fp: r.fp }));
  cache = {
    at: Date.now(),
    list,
    version: blockFingerprint(rows.map((r) => r.id)),
  };
  return cache;
}

/** Leçon servie avec ses masques ; empreinte modifiée si quelque chose est masqué. */
export function maskUnit<T extends MaskableUnit & { sha256: string }>(
  unit: T,
  list: Suspension[],
): T {
  const masked = applySuspensions(unit, list);
  if (masked === unit) return unit;
  const mine = list.filter((s) => s.unitId === unit.id);
  return { ...masked, sha256: `${unit.sha256}~s${blockFingerprint(mine)}` };
}
