/**
 * Audio des leçons (chantier A3) : fichiers des textes « à écouter » des livres (voix de synthèse
 * provisoire). Un bouton n'apparaît QUE si le fichier du texte existe (clé `audioKey` du moteur des livres) ;
 * jamais de synthèse du navigateur, jamais d'audio de synthèse sur un texte coranique (garde à l'import et
 * ici), aucune lecture automatique. Hors ligne : fichiers gardés dans IndexedDB (« audio »).
 */
import { audioFileId, looksQuranic } from '@awform/content/audio-cle';
import { get, kvGet } from './idb';

export const AUDIO_CTX = 'lecons-audio';
export const AUDIO_API = '/api/v1/lecons-audio';
/** lecture lente : 0,8, hauteur de la voix conservée (preservesPitch) */
export const SLOW_RATE = 0.8;

export interface LevelAudioJson {
  niveau: string;
  fichiers: string[];
  octets: number;
  mention: string;
  credits: string[];
}
export interface LevelAudio extends Omit<LevelAudioJson, 'fichiers'> {
  fichiers: Set<string>;
}

/** clé « kv » de la liste des fichiers d'un niveau téléchargé AVEC l'audio */
export const audioKvKey = (level: string) => `lecons-audio:${level}`;

const cache = new Map<string, Promise<LevelAudio | null>>();

/** Fichiers d'un niveau : copie de l'appareil si l'audio est téléchargé, sinon le réseau ; null si rien. */
export function levelAudio(
  level: string,
  fetchFn: typeof fetch = fetch,
): Promise<LevelAudio | null> {
  let p = cache.get(level);
  if (!p) {
    p = (async () => {
      let j = await kvGet<LevelAudioJson>(audioKvKey(level)).catch(() => undefined);
      if (!j) {
        try {
          const r = await fetchFn(`${AUDIO_API}/niveaux/${encodeURIComponent(level)}`);
          if (r.ok) j = (await r.json()) as LevelAudioJson;
        } catch {
          /* hors ligne : pas de bouton */
        }
      }
      if (!j) cache.delete(level);
      return j?.fichiers.length ? { ...j, fichiers: new Set(j.fichiers) } : null;
    })();
    cache.set(level, p);
  }
  return p;
}

export function forgetLevelAudio(level: string): void {
  cache.delete(level);
}

/** Fichier du texte s'il existe ; null pour un texte coranique, vide ou sans fichier. */
export function audioIdFor(text: string, la: LevelAudio | null): string | null {
  if (!la || !text || looksQuranic(text)) return null;
  const id = audioFileId(text);
  return id && la.fichiers.has(id) ? id : null;
}

let current: { a: HTMLAudioElement; url?: string } | null = null;

export function stopLessonAudio(): void {
  if (!current) return;
  current.a.pause();
  if (current.url) URL.revokeObjectURL(current.url);
  current = null;
}

/** Joue le fichier (copie de l'appareil d'abord) ; un seul son à la fois. */
export async function playLessonAudio(id: string, slow: boolean): Promise<HTMLAudioElement> {
  stopLessonAudio();
  const stored = await get<{ id: string; blob: Blob }>('audio', id).catch(() => undefined);
  const url = stored ? URL.createObjectURL(stored.blob) : undefined;
  const a = new Audio(url ?? `${AUDIO_API}/fichiers/${id}.mp3`);
  a.preservesPitch = true;
  a.defaultPlaybackRate = a.playbackRate = slow ? SLOW_RATE : 1;
  current = { a, url };
  await a.play();
  return a;
}

/** Paramètres du lien vers la récitation du Complexe d'un verset (« Al-Fātiḥa 1:2 », « 112:1-4 ») ; null sinon. */
export function recitationQuery(ref: string | undefined): string | null {
  const m = /(\d{1,3})\s*:\s*(\d{1,3})/.exec(ref ?? '');
  const s = Number(m?.[1]);
  if (!m || s < 1 || s > 114) return null;
  return `?s=${s}&a=${Number(m[2])}`;
}
