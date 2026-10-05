/**
 * Audio des leçons HORS LIGNE (A3) : option « avec l'audio » d'un niveau téléchargé. Taille affichée avant
 * tout téléchargement, Wi-Fi seulement par défaut (réglage), fichiers gardés dans IndexedDB ; un fichier
 * commun à deux niveaux n'est gardé qu'une fois et n'est retiré qu'avec le dernier niveau qui l'emploie.
 */
import { delMany, get, kvGet, kvKeys, kvSet, putRaw } from './idb';
import { addBytes } from './offline';
import { AUDIO_API, audioKvKey, forgetLevelAudio, type LevelAudioJson } from './lecons-audio';

export interface AudioSummary {
  niveau: string;
  fichiers: number;
  octets: number;
}

/** Taille de l'audio de chaque niveau (petite liste, sans les fichiers). */
export async function audioSummary(fetchFn: typeof fetch = fetch): Promise<AudioSummary[]> {
  try {
    const r = await fetchFn(`${AUDIO_API}/niveaux`);
    return r.ok ? ((await r.json()) as { niveaux: AudioSummary[] }).niveaux : [];
  } catch {
    return [];
  }
}

/** Wi-Fi (ou câble) : vrai ; données mobiles : faux ; inconnu (navigateur muet) : null. */
export function onWifi(): boolean | null {
  const c = (globalThis.navigator as Navigator & { connection?: { type?: string } })?.connection;
  if (!c?.type || c.type === 'unknown') return null;
  return c.type === 'wifi' || c.type === 'ethernet';
}

export async function hasLevelAudio(level: string): Promise<boolean> {
  return !!(await kvGet(audioKvKey(level)).catch(() => undefined));
}

/** Télécharge l'audio d'un niveau (reprise possible : les fichiers déjà gardés ne sont pas retéléchargés). */
export async function downloadLevelAudio(
  level: string,
  onProgress?: (done: number, total: number) => void,
  fetchFn: typeof fetch = fetch,
): Promise<{ fichiers: number; octets: number }> {
  const r = await fetchFn(`${AUDIO_API}/niveaux/${encodeURIComponent(level)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as LevelAudioJson;
  let done = 0;
  let octets = 0;
  const queue = [...j.fichiers];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      if (!(await get('audio', id))) {
        const f = await fetchFn(`${AUDIO_API}/fichiers/${id}.mp3`);
        if (!f.ok) throw new Error(`HTTP ${f.status}`);
        const blob = await f.blob();
        await putRaw('audio', { id, blob });
        octets += blob.size;
      }
      onProgress?.(++done, j.fichiers.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await addBytes(octets);
  // liste écrite EN DERNIER : le niveau n'est « avec l'audio » que si tout est là
  await kvSet(audioKvKey(level), j);
  forgetLevelAudio(level);
  return { fichiers: j.fichiers.length, octets };
}

/** Retire l'audio d'un niveau (les fichiers employés par un autre niveau téléchargé restent). */
export async function removeLevelAudio(level: string): Promise<void> {
  const j = await kvGet<LevelAudioJson>(audioKvKey(level));
  if (!j) return;
  const keep = new Set<string>();
  for (const k of await kvKeys())
    if (k.startsWith('lecons-audio:') && k !== audioKvKey(level))
      for (const id of (await kvGet<LevelAudioJson>(k))?.fichiers ?? []) keep.add(id);
  await delMany('kv', [audioKvKey(level)]);
  await delMany(
    'audio',
    j.fichiers.filter((id) => !keep.has(id)),
  );
  forgetLevelAudio(level);
}
