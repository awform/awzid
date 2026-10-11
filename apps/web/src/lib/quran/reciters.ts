/**
 * Lot 27 — récitateurs proposés à l'écran : pour un profil, la liste autorisée (parent ∩ classe) et sa
 * préférence ; sans profil (visiteur), tous les récitateurs actifs. Pistes d'une sourate selon le cas.
 */
import {
  profileReciters,
  profileSuraTracks,
  reciters,
  suraPack,
  type ModeAudio,
  type Reciter,
  type SuraPack,
} from '$lib/coran-audio';
import { kvGet, kvSet } from '$lib/idb';
import type { ApiResult } from '$lib/session';

/**
 * F5 — hors ligne, un verset DÉJÀ ÉCOUTÉ se réécoute : la dernière liste de récitateurs et les dernières pistes
 * reçues (par profil, mode et sourate) sont gardées sur l'appareil et servies quand le réseau MANQUE (jamais
 * quand le serveur refuse : liste restreinte par le parent, riwāya du carnet…). Données publiques, petites.
 */
async function gardee<T>(cle: string, r: ApiResult<T>): Promise<ApiResult<T>> {
  if (r.ok && r.data) {
    void kvSet(cle, r.data).catch(() => {});
    return r;
  }
  if (r.status !== 0) return r;
  const d = await kvGet<T>(cle).catch(() => undefined);
  return d ? { ok: true, status: 200, data: d, code: null, error: null } : r;
}

export interface ReciterChoice {
  list: Reciter[];
  /** récitateur conseillé aux débutants (Muḥammad Ayyūb), s'il est disponible */
  conseil: string | null;
  /** liste restreinte par le parent ou l'enseignant */
  restreint: boolean;
  /** récitateur à proposer d'abord : préférence du profil, sinon le conseil, sinon le premier */
  initial: string | null;
  /** échec du chargement : « hors_ligne » ou « erreur » */
  error: 'hors_ligne' | 'erreur' | null;
}

export async function loadReciters(
  profileId: string | null,
  mode: ModeAudio = 'ecouter',
): Promise<ReciterChoice> {
  const offline = () =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'hors_ligne' : 'erreur';
  if (profileId) {
    const r = await gardee(
      `coranAudio.recitateurs.${profileId}.${mode}`,
      await profileReciters(profileId, mode),
    );
    if (!r.ok || !r.data)
      return { list: [], conseil: null, restreint: false, initial: null, error: offline() };
    const d = r.data;
    const ids = d.reciters.map((x) => x.id);
    const pick = [d.preference.effectif, d.preference.choisi, d.conseilDebutant].find(
      (x) => x && ids.includes(x),
    );
    return {
      list: d.reciters,
      conseil: d.conseilDebutant && ids.includes(d.conseilDebutant) ? d.conseilDebutant : null,
      restreint: d.restreint,
      initial: pick ?? ids[0] ?? null,
      error: null,
    };
  }
  const r = await gardee('coranAudio.recitateurs.visiteur', await reciters());
  if (!r.ok || !r.data)
    return { list: [], conseil: null, restreint: false, initial: null, error: offline() };
  const ids = r.data.reciters.map((x) => x.id);
  const conseil = ids.includes(r.data.conseilDebutant) ? r.data.conseilDebutant : null;
  return {
    list: r.data.reciters,
    conseil,
    restreint: false,
    initial: conseil ?? ids[0] ?? null,
    error: null,
  };
}

export async function loadTracks(
  profileId: string | null,
  reciterId: string,
  sura: number,
  mode: ModeAudio = 'ecouter',
): Promise<{ pack: SuraPack | null; code: string | null }> {
  const r = await gardee(
    `coranAudio.pistes.${profileId ?? 'visiteur'}.${mode}.${reciterId}.${sura}`,
    profileId
      ? await profileSuraTracks(profileId, sura, reciterId, mode)
      : await suraPack(reciterId, sura),
  );
  return r.ok
    ? { pack: r.data, code: null }
    : { pack: null, code: r.code ?? (navigator.onLine ? 'erreur' : 'hors_ligne') };
}
