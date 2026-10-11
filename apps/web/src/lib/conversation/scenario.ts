/**
 * A26b, phase 1 — scénarios « Je parle » (sans IA) : fichiers statiques `/conversation/<niveau>/<lecon>.json`
 * générés depuis les dialogues des livres (packages/content, cli-conversation). Jamais préchargés par le service
 * worker : demandés quand l'élève ouvre une leçon, puis gardés dans IndexedDB (hors ligne ensuite).
 */
import type { Scenario } from '@awform/content/conversation';
import { DISPONIBLES } from './disponibles';
import { kvGet, kvSet } from '../idb';

export type { Scenario };
const VERSION = 1;
const cle = (id: string) => `conv:${id}`;

/** La leçon a-t-elle un scénario « Je parle » ? (liste écrite à la génération) */
export function aUnScenario(unitId: string): boolean {
  const m = /^([a-z]+\d+)\.l(\d{2})$/.exec(unitId);
  return !!m && (DISPONIBLES[m[1]!] ?? '').split(',').includes(m[2]!);
}

export function urlScenario(unitId: string): string {
  const [lv, l] = unitId.split('.');
  return `/conversation/${lv}/${l}.json`;
}

async function duReseau(unitId: string): Promise<Scenario | null> {
  const r = await fetch(urlScenario(unitId), { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const s = (await r.json()) as Scenario;
  if (s?.v !== VERSION || s.id !== unitId) return null;
  await kvSet(cle(unitId), s).catch(() => {});
  return s;
}

/** Scénario de la leçon : réseau d'abord (à jour), sinon la copie gardée sur l'appareil. */
export async function chargerScenario(unitId: string): Promise<Scenario | null> {
  try {
    const s = await duReseau(unitId);
    if (s) return s;
  } catch {
    /* hors ligne : copie gardée */
  }
  const s = await kvGet<Scenario>(cle(unitId)).catch(() => undefined);
  return s?.v === VERSION ? s : null;
}

/** Garde le scénario sur l'appareil dès l'ouverture de la leçon (en ligne), sans rien bloquer. */
export async function garderScenario(unitId: string): Promise<void> {
  if (!aUnScenario(unitId)) return;
  const deja = await kvGet<Scenario>(cle(unitId)).catch(() => undefined);
  if (deja?.v === VERSION) return;
  await duReseau(unitId).catch(() => null);
}
