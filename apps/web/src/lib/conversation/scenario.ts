/**
 * A26b, phase 1 — scénarios « Je parle » (sans IA), générés depuis les dialogues des livres
 * (packages/content, cli-conversation). Servis par l'API avec les droits des leçons
 * (`GET /api/v1/profiles/:id/conversation/:unit` : profil de la famille, interrupteur, formule, parcours), jamais
 * publics ; gardés ensuite dans IndexedDB, PAR PROFIL (hors ligne après la première ouverture).
 */
import type { Scenario } from '@awform/content/conversation';
import { DISPONIBLES } from './disponibles';
import { kvGet, kvSet } from '../idb';

export type { Scenario };
const VERSION = 1;
const cle = (profileId: string, id: string) => `conv:${profileId}:${id}`;

/** La leçon a-t-elle un scénario « Je parle » ? (liste écrite à la génération) */
export function aUnScenario(unitId: string): boolean {
  const m = /^([a-z]+\d+)\.l(\d{2})$/.exec(unitId);
  return !!m && (DISPONIBLES[m[1]!] ?? '').split(',').includes(m[2]!);
}

export const urlScenario = (profileId: string, unitId: string) =>
  `/api/v1/profiles/${encodeURIComponent(profileId)}/conversation/${encodeURIComponent(unitId)}`;

export type Echec = 'refuse' | 'reseau';

/** Réponse du serveur : scénario, refus (droits, niveau fermé, fonction coupée) ou réseau absent. */
async function duServeur(profileId: string, unitId: string): Promise<Scenario | Echec> {
  let r: Response;
  try {
    r = await fetch(urlScenario(profileId, unitId), {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return 'reseau';
  }
  if (r.status === 401 || r.status === 403 || r.status === 404) return 'refuse';
  if (!r.ok) return 'reseau';
  const s = (await r.json()) as Scenario;
  if (s?.v !== VERSION || s.id !== unitId) return 'refuse';
  await kvSet(cle(profileId, unitId), s).catch(() => {});
  return s;
}

/** Scénario de la leçon : serveur d'abord (à jour, droits vérifiés), sinon la copie gardée pour CE profil. */
export async function chargerScenario(
  profileId: string,
  unitId: string,
): Promise<Scenario | Echec> {
  const s = await duServeur(profileId, unitId);
  if (typeof s !== 'string' || s === 'refuse') return s;
  const k = await kvGet<Scenario>(cle(profileId, unitId)).catch(() => undefined);
  return k?.v === VERSION ? k : 'reseau';
}

/** Garde le scénario sur l'appareil dès l'ouverture de la leçon (en ligne), sans rien bloquer. */
export async function garderScenario(profileId: string, unitId: string): Promise<void> {
  if (!aUnScenario(unitId)) return;
  const deja = await kvGet<Scenario>(cle(profileId, unitId)).catch(() => undefined);
  if (deja?.v === VERSION) return;
  await duServeur(profileId, unitId);
}
