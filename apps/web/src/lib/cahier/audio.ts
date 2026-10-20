/**
 * Cahier de lecture (20/10/2026) — voix du cahier.
 *  - Syllabes, mots, phrases, lignes de textes : fichiers de synthèse du niveau (clé `audioKey` du projet, copie de
 *    l'appareil d'abord) ; jamais de synthèse à la volée, jamais de synthèse sur un texte coranique (`audioIdFor`).
 *  - Coran (muṣḥaf, lettres isolées, sourates) : RÉCITATION STOCKÉE de Muḥammad Ayyūb, verset par verset ; jamais de
 *    voix de synthèse (un élément « q » ne passe jamais par les fichiers de synthèse).
 *  - Lecture guidée : `lecture.ts`.
 */
import { audioIdFor, playLessonAudio, stopLessonAudio, type LevelAudio } from '$lib/lecons-audio';
import { loadTracks } from '$lib/quran/reciters';
import type { El } from './donnees';
import { refVerset } from './lecture';

export { lectureGuidee, type Pas } from './lecture';

/** récitateur conseillé aux débutants (récitation stockée du Complexe) */
export const RECITATEUR = 'ayyoub-hafs';

/** Fichier de synthèse d'un élément (null : récitation, texte coranique ou fichier absent). */
export function idSynthese(e: El, la: LevelAudio | null): string | null {
  if (e.a === 'q') return null;
  return audioIdFor(e.ar, la);
}

let recit: HTMLAudioElement | null = null;
let recitUrl: string | null = null;
let enRecitation = false;
function arreterRecitation() {
  recit?.pause();
  if (recitUrl?.startsWith('blob:')) URL.revokeObjectURL(recitUrl);
  recit = null;
  recitUrl = null;
}
if (typeof document !== 'undefined')
  document.addEventListener('awzid-son', () => {
    // un autre son de l'application commence (leçon, lecteur) : la récitation s'arrête
    if (!enRecitation) arreterRecitation();
  });

/** Arrête tout son du cahier (synthèse et récitation). */
export function arreterSon(): void {
  stopLessonAudio();
  arreterRecitation();
}

/** Attend la fin d'un son ; renvoie sa durée (ms). */
function fin(a: HTMLAudioElement, signal?: AbortSignal): Promise<number> {
  return new Promise((ok, ko) => {
    const done = () => ok(Math.round((Number.isFinite(a.duration) ? a.duration : 1) * 1000));
    if (a.ended) return done();
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', () => ko(new Error('audio')), { once: true });
    a.addEventListener('pause', () => (a.ended ? done() : ko(new Error('arret'))), { once: true });
    signal?.addEventListener(
      'abort',
      () => {
        a.pause();
        ko(new Error('arret'));
      },
      { once: true },
    );
  });
}

/**
 * Fichier de récitation gardé sur l'appareil : sourate téléchargée dans l'onglet Coran ou verset déjà écouté (mêmes caches que
 * lib/quran/offline-audio.ts, sans charger les outils du Coran avec le cahier) ; sinon le réseau.
 */
export const CACHES_RECITATION = ['awzid-coran-audio-v1', 'awzid-coran-audio-recents'];
async function urlRecitation(url: string): Promise<string> {
  try {
    if (typeof caches !== 'undefined')
      for (const nom of CACHES_RECITATION) {
        const hit = await (await caches.open(nom)).match(url, { ignoreVary: true });
        if (hit) return URL.createObjectURL(await hit.blob());
      }
  } catch {
    /* cache indisponible : réseau */
  }
  return url;
}

/** Récitation d'un verset (Ayyūb), copie de l'appareil d'abord ; rejette si elle n'est pas disponible. */
export async function reciter(
  ref: string | undefined,
  profileId: string | null,
  signal?: AbortSignal,
): Promise<number> {
  const r = refVerset(ref);
  if (!r) throw new Error('reference');
  const { pack } = await loadTracks(profileId, RECITATEUR, r.s);
  const f = pack?.files.find((x) => x.aya === r.v);
  if (!f) throw new Error('recitation indisponible');
  arreterSon();
  enRecitation = true;
  document.dispatchEvent(new Event('awzid-son'));
  enRecitation = false;
  recitUrl = await urlRecitation(f.url);
  recit = new Audio(recitUrl);
  await recit.play();
  return fin(recit, signal);
}

/**
 * Joue un élément jusqu'au bout ; renvoie la durée (ms), ou null s'il n'a pas de son. La récitation n'est jamais
 * remplacée par une voix de synthèse.
 */
export async function jouerElement(
  e: El,
  la: LevelAudio | null,
  profileId: string | null,
  signal?: AbortSignal,
): Promise<number | null> {
  if (e.a === 'q') return reciter(e.ref, profileId, signal);
  const id = idSynthese(e, la);
  if (!id) return null;
  arreterRecitation();
  const a = await playLessonAudio(id, false);
  return fin(a, signal);
}
