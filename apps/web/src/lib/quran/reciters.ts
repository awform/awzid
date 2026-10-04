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
    const r = await profileReciters(profileId, mode);
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
  const r = await reciters();
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
  const r = profileId
    ? await profileSuraTracks(profileId, sura, reciterId, mode)
    : await suraPack(reciterId, sura);
  return r.ok
    ? { pack: r.data, code: null }
    : { pack: null, code: r.code ?? (navigator.onLine ? 'erreur' : 'hors_ligne') };
}
