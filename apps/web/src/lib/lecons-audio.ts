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
/** lecture lente : 0,75 (la plus basse vitesse du lecteur), hauteur de la voix conservée (preservesPitch) */
export const SLOW_RATE = 0.75;

export interface LevelAudioJson {
  niveau: string;
  fichiers: string[];
  octets: number;
  mention: string;
  credits: string[];
  /** fichiers des textes de la liste blanche du serveur */
  autorises?: string[];
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

/**
 * Fichier du texte s'il existe ; null pour un texte vide ou sans fichier, et pour un texte en graphie du Muṣḥaf SAUF s'il
 * est dans la liste blanche du serveur (`autorises` : mot de vocabulaire de moins de 4 mots, chaque texte ajouté avec sa
 * raison ; jamais un verset entier ni une lettre détachée : la liste n'en a aucun, test). Pas d'assouplissement général.
 */
export function audioIdFor(text: string, la: LevelAudio | null): string | null {
  const id = la && text && audioFileId(text);
  return id && la!.fichiers.has(id) && (!looksQuranic(text) || la!.autorises?.includes(id))
    ? id
    : null;
}

let current: { a: HTMLAudioElement; url?: string } | null = null;

export function stopLessonAudio(): void {
  if (!current) return;
  current.a.pause();
  if (current.url) URL.revokeObjectURL(current.url);
  current = null;
}

/** Source du fichier d'un texte : copie de l'appareil d'abord (IndexedDB), sinon le réseau (lecteur et animations). */
export async function leconsSource(id: string): Promise<{ url: string; liberer?: () => void }> {
  const stored = await get<{ id: string; blob: Blob }>('audio', id).catch(() => undefined);
  if (!stored) return { url: `${AUDIO_API}/fichiers/${id}.mp3` };
  const url = URL.createObjectURL(stored.blob);
  return { url, liberer: () => URL.revokeObjectURL(url) };
}

/** Joue le fichier (copie de l'appareil d'abord) ; un seul son à la fois (le lecteur se met en pause). */
export async function playLessonAudio(id: string, slow: boolean): Promise<HTMLAudioElement> {
  stopLessonAudio();
  document.dispatchEvent(new Event('awzid-son'));
  const s = await leconsSource(id);
  const url = s.liberer ? s.url : undefined;
  const a = new Audio(s.url);
  a.preservesPitch = true;
  a.defaultPlaybackRate = a.playbackRate = slow ? SLOW_RATE : 1;
  current = { a, url };
  await a.play();
  return a;
}

/** Paramètres du lien vers la récitation du Complexe d'un verset (« Al-Fātiḥa 1:2 », « 112:1-4 ») ; null sinon. */
/** Texte « à écouter » d'une page de lecture graduée : la page entière, lignes (« | ») jointes par une espace. */
export function pageAudioText(ar: string): string {
  return ar.replace(/\|/g, ' ');
}

export function recitationQuery(ref: string | undefined): string | null {
  const m = /(\d{1,3})\s*:\s*(\d{1,3})/.exec(ref ?? '');
  const s = Number(m?.[1]);
  if (!m || s < 1 || s > 114) return null;
  return `?s=${s}&a=${Number(m[2])}`;
}
