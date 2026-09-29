/**
 * Enregistrements de récitation (ARCHITECTURE_V2 § 2.4 « Je récite ») — version LOCALE du lot 5 :
 *  - l'audio reste sur l'appareil (IndexedDB), il n'est JAMAIS envoyé : pas d'écoute par un serveur ni par
 *    l'enseignant (prévue au lot S4 avec consentement, chiffrement et effacement) ;
 *  - effacé automatiquement au bout de 7 jours ; l'élève peut l'effacer tout de suite ;
 *  - profil d'enfant : seulement si le parent l'a autorisé sur cet appareil.
 */
import { delMany, getAll, getAllByIndex, kvGet, kvSet, putRaw } from './idb';
import { uuidv7 } from './sync-core';

export const KEEP_DAYS = 7;

export interface Recording {
  id: string;
  profileId: string;
  part: string;
  createdAt: string;
  mime: string;
  blob: Blob;
}

export async function listRecordings(profileId: string, now = Date.now()): Promise<Recording[]> {
  const all = await getAllByIndex<Recording>('recordings', 'profile', profileId).catch(() => []);
  const old = all.filter((r) => now - Date.parse(r.createdAt) > KEEP_DAYS * 86_400_000);
  if (old.length)
    await delMany(
      'recordings',
      old.map((r) => r.id),
    ).catch(() => {});
  return all.filter((r) => !old.includes(r)).sort((a, b) => (a.id < b.id ? 1 : -1));
}

/**
 * Efface les enregistrements de plus de 7 jours de TOUS les profils de l'appareil (audit MIN-16) : appelée au
 * démarrage de l'application et à l'activation du service worker, pas seulement à l'ouverture de l'écran.
 */
export async function purgeOldRecordings(now = Date.now()): Promise<number> {
  const all = await getAll<Recording>('recordings').catch(() => []);
  const old = all.filter((r) => now - Date.parse(r.createdAt) > KEEP_DAYS * 86_400_000);
  if (old.length)
    await delMany(
      'recordings',
      old.map((r) => r.id),
    ).catch(() => {});
  return old.length;
}

export async function saveRecording(
  profileId: string,
  part: string,
  blob: Blob,
): Promise<Recording> {
  const rec: Recording = {
    id: uuidv7(),
    profileId,
    part,
    createdAt: new Date().toISOString(),
    mime: blob.type || 'audio/webm',
    blob,
  };
  await putRaw('recordings', rec);
  return rec;
}

export async function deleteRecording(id: string): Promise<void> {
  await delMany('recordings', [id]);
}

/** Autorisation du parent pour un profil d'enfant, sur cet appareil. */
export async function recordingAllowed(profileId: string): Promise<boolean> {
  return (await kvGet<boolean>(`recLocal:${profileId}`).catch(() => false)) === true;
}

export async function setRecordingAllowed(profileId: string, v: boolean): Promise<void> {
  await kvSet(`recLocal:${profileId}`, v);
}
