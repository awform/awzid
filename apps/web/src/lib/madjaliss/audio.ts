/**
 * Madjaliss — AUDIO des phrases (lot 9). Décision du client des 13 et 14/10/2026 : voix de synthèse AUTORISÉE pour les
 * textes de fiqh des cycles 1 et 2, JAMAIS pour le Coran (garde `texteVoixSynthese`, en plus de celle de la
 * construction). Une phrase n'a un bouton « Écouter » que si :
 *  - la construction lui a donné un fichier (`audio`, texte servi identique à celui de la génération) ;
 *  - elle passe la garde de la voix de synthèse (ni Coran, ni passage réservé, ni vers masqué ou non confirmé) ;
 *  - sa lecture n'est pas incertaine ;
 *  - le profil la voit : une phrase `adulte` jamais pour un enfant ni un ado (profil inconnu = ado, comme `matnPour`).
 * Les phrases d'une séance différée ne sont dans le texte qu'avec le droit (`matnPour`) ; la route le revérifie.
 * Lecture : copie de l'appareil d'abord (IndexedDB « audio », clé `mj:<texte>/<id>.mp3`), sinon le réseau, puis gardée :
 * à l'ouverture d'une séance, ses fichiers sont gardés en arrière-plan (hors ligne ensuite, comme le texte). Aucune
 * lecture automatique ; un seul son à la fois.
 */
import { get, putRaw } from '$lib/idb';
import { texteVoixSynthese, type Phrase, type Public } from './donnees';

export const MJ_AUDIO = '/mutun/audio/';
const cle = (chemin: string) => `mj:${chemin}`;

/** Chemin de l'audio d'une phrase pour ce profil, ou null (pas de bouton). */
export function audioDe(p: Phrase, kind: Public | null): string | null {
  if (!p.audio || p.incertain || texteVoixSynthese(p) === null) return null;
  if (p.adulte && kind !== 'adulte') return null;
  return p.audio;
}

async function telecharger(chemin: string): Promise<Blob | null> {
  const r = await fetch(MJ_AUDIO + chemin, { credentials: 'same-origin' });
  if (!r.ok) return null;
  const blob = await r.blob();
  // Blob gardé tel quel (pas de copie JSON : put le viderait)
  await putRaw('audio', { id: cle(chemin), blob }).catch(() => undefined);
  return blob;
}

/** Garde sur l'appareil les fichiers d'une séance ouverte (en ligne seulement, sans bloquer, sans erreur). */
export async function garderAudio(chemins: readonly string[]): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  for (const c of chemins) {
    const deja = await get<{ blob?: unknown }>('audio', cle(c)).catch(() => undefined);
    if (!(deja?.blob instanceof Blob)) await telecharger(c).catch(() => null);
  }
}

let courant: { a: HTMLAudioElement; url: string } | null = null;

export function arreterAudio(): void {
  if (!courant) return;
  courant.a.pause();
  URL.revokeObjectURL(courant.url);
  courant = null;
}

/** Joue la phrase (copie de l'appareil d'abord) ; false si le fichier est introuvable (hors ligne, droit retiré). */
export async function jouerAudio(chemin: string): Promise<boolean> {
  arreterAudio();
  const garde = await get<{ id: string; blob: Blob }>('audio', cle(chemin)).catch(() => undefined);
  const blob =
    garde?.blob instanceof Blob ? garde.blob : await telecharger(chemin).catch(() => null);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  courant = { a, url };
  a.addEventListener('ended', () => {
    if (courant?.a === a) arreterAudio();
  });
  await a.play();
  return true;
}
