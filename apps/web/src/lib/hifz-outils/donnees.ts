/**
 * Hifẓ complet — données des outils (appareil d'abord, hors ligne) : carnet du jour (même calcul que « Mon carnet
 * de hifẓ »), carte des erreurs (serveur + file de l'appareil + bilans de l'IA d'écoute gardés sur l'appareil),
 * deux passages pour la prière (gardés sur l'appareil).
 */
import { suraName } from '@awform/hifz';
import { enqueue } from '$lib/attempts';
import {
  computeToday,
  loadBook,
  loadMeta,
  loadProfileHifz,
  localIso,
  pendingHifz,
  type ServerEvent,
  type TodayView,
} from '$lib/hifz';
import { getAll, kvGet, kvSet } from '$lib/idb';
import { call } from '$lib/session';
import type { Bilan } from '$lib/ecoute/bilans';
import type { AttemptEvent } from '$lib/sync-core';
import {
  marquesDesBilans,
  passagesMemorises,
  type Marque,
  type Passage,
  type Plage,
} from './outils';

export interface Carnet {
  view: TodayView;
  events: ServerEvent[];
  passages: Passage[];
  basmala: string;
}

/** Carnet du jour d'un profil (null : pas de plan, ou rien en copie locale hors ligne). */
export async function chargerCarnet(profileId: string, today = localIso()): Promise<Carnet | null> {
  const data = await loadProfileHifz(profileId);
  const plan = data?.plan;
  if (!data || !plan) return null;
  const meta = await loadMeta();
  const pack = plan.mode === 'carnet' && plan.bookCode ? await loadBook(plan.bookCode) : null;
  const pending = await pendingHifz(profileId);
  const known = new Set(data.events.map((e) => e.id));
  const events = [...data.events, ...pending.filter((e) => !known.has(e.id))];
  const view = computeToday(plan, events, meta, pack, today);
  if (!view) return null;
  return {
    view,
    events,
    passages: passagesMemorises(view.state.parts.values(), view.parts),
    basmala: meta?.basmala ?? '',
  };
}

/** « Al-Ikhlāṣ 112:1-4 » */
export const libelle = (r: Plage) =>
  `${suraName(r.s)} ${r.s}:${r.from}${r.to !== r.from ? `-${r.to}` : ''}`;

/** Clé de part d'une plage (même forme que les carnets : « 112:1-4 », « 2:255 »). */
export const cleDe = (r: Plage) => `${r.s}:${r.from}${r.to !== r.from ? `-${r.to}` : ''}`;

// ---------------------------------------------------------------- carte des erreurs

const CLE_MARQUES = (p: string) => `hifz.marques:${p}`;

/** Toutes les marques du profil : bilans de l'IA (appareil), serveur (copie locale), file de l'appareil. */
export async function marquesDe(profileId: string): Promise<Marque[]> {
  const r = await call<{ marques: Marque[] }>('GET', `/hifz/profiles/${profileId}/marques`).catch(
    () => null,
  );
  let serveur: Marque[];
  if (r?.ok && r.data) {
    serveur = r.data.marques;
    await kvSet(CLE_MARQUES(profileId), serveur).catch(() => {});
  } else serveur = (await kvGet<Marque[]>(CLE_MARQUES(profileId)).catch(() => undefined)) ?? [];
  const connues = new Set(serveur.map((m) => m.id));
  const file = (await getAll<AttemptEvent>('events').catch(() => [] as AttemptEvent[]))
    .filter((e) => e.eventType === 'hifz_marque' && e.profileId === profileId)
    .map((e) => ({ id: e.id, ...(e.response as Omit<Marque, 'id'>) }))
    .filter((m) => !connues.has(m.id));
  return [...marquesDesBilans(await bilansEcoute(profileId)), ...serveur, ...file];
}

/**
 * Bilans de l'IA d'écoute (A5) gardés sur l'APPAREIL seulement (même clé que `$lib/ecoute/bilans`, lue ici sans
 * importer ce module : il reste hors du morceau commun à toutes les pages). Jamais envoyés au serveur.
 */
export async function bilansEcoute(profileId: string): Promise<Bilan[]> {
  return (await kvGet<Bilan[]>(`ecoute.bilans:${profileId}`).catch(() => undefined)) ?? [];
}

/** Pose des marques (file hors ligne commune, envoyées au serveur avec le reste). */
export async function poserMarques(
  profileId: string,
  marques: ReadonlyArray<Pick<Marque, 's' | 'a' | 'k' | 't'>>,
  src: 'test' | 'auto' | 'parent' = 'test',
  day = localIso(),
): Promise<void> {
  for (const m of marques)
    await enqueue({
      profileId,
      unitId: 'hifz',
      eventType: 'hifz_marque',
      response: { day, s: m.s, a: m.a, k: m.k, t: m.t, src },
    });
}

// ---------------------------------------------------------------- deux rakʿa

export interface Priere {
  r1: (Plage & { key: string }) | null;
  r2: (Plage & { key: string }) | null;
}
const CLE_PRIERE = (p: string) => `hifz.priere:${p}`;
export async function lirePriere(profileId: string): Promise<Priere> {
  return (
    (await kvGet<Priere>(CLE_PRIERE(profileId)).catch(() => undefined)) ?? { r1: null, r2: null }
  );
}
export async function garderPriere(profileId: string, p: Priere): Promise<void> {
  // copie simple (IndexedDB ne garde pas les objets réactifs)
  await kvSet(CLE_PRIERE(profileId), JSON.parse(JSON.stringify(p)) as Priere).catch(() => {});
}
