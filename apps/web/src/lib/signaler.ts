/**
 * Lot F1 (revue M1) côté appareil : « Signaler une erreur » et suspensions d'urgence.
 *  - un signalement part tout de suite ; sans réseau, il attend sur l'appareil (au plus 20) et part au retour ;
 *  - la liste des suspensions est gardée hors ligne : une leçon téléchargée avant une suspension est masquée
 *    de la même façon que par le serveur (`applySuspensions`, module partagé).
 */
import { applySuspensions, type Suspension } from '@awform/content/suspension';
import { kvGet, kvSet } from './idb';
import { call } from './session';

export interface ReportBody {
  targetKind: 'verset' | 'hadith' | 'fiqh' | 'lecon' | 'exercice';
  unitId: string;
  path?: string;
  ref?: string;
  excerpt?: string;
  fp?: string;
  reason: string;
  comment?: string;
  edition?: string;
}

const PENDING = 'pendingReports';
const SUSP = 'suspensions';

/** Envoie un signalement : « ok », « attente » (hors ligne, gardé) ou le code d'erreur du serveur. */
export async function sendReport(b: ReportBody): Promise<string> {
  const r = await call('POST', '/contenu/signalements', b);
  if (r.ok) return 'ok';
  if (r.code !== 'reseau') return r.code ?? 'erreur';
  const list = ((await kvGet<ReportBody[]>(PENDING).catch(() => undefined)) ?? []).slice(-19);
  await kvSet(PENDING, [...list, b]).catch(() => {});
  return 'attente';
}

/** Au démarrage et au retour du réseau : suspensions à jour, signalements en attente envoyés. */
export async function refreshContentState(): Promise<void> {
  const s = await call<{ suspensions: Suspension[] }>('GET', '/contenu/suspensions');
  if (s.ok && s.data) await kvSet(SUSP, s.data.suspensions).catch(() => {});
  const list = (await kvGet<ReportBody[]>(PENDING).catch(() => undefined)) ?? [];
  const left: ReportBody[] = [];
  for (const b of list) {
    const r = await call('POST', '/contenu/signalements', b);
    if (!r.ok && r.code === 'reseau') left.push(b);
  }
  if (list.length) await kvSet(PENDING, left).catch(() => {});
}

/** Leçon gardée sur l'appareil, avec les suspensions connues appliquées. */
export async function maskLocal<
  T extends { id: string; lesson: unknown; exercises: Array<{ id: string; position: number }> },
>(unit: T): Promise<T> {
  const list = (await kvGet<Suspension[]>(SUSP).catch(() => undefined)) ?? [];
  return applySuspensions(unit, list);
}
