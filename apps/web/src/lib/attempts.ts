/**
 * Tentatives côté page : mise en file (IndexedDB) puis envoi immédiat si le réseau est là ; sinon envoi
 * au retour du réseau (événement « online ») ou par le service worker (Background Sync quand le navigateur
 * le permet). Profil actif : celui choisi sur l'appareil (« Qui apprend ? », mode école) ; les réponses ne
 * sont acceptées par le serveur que pour les profils du compte connecté (lot 4).
 */
import { kvGet, kvSet } from './idb';
import { cachedMe, fetchMe, type ProfileInfo } from './session';
import { flushQueue, pendingCount, queueEvent, type AttemptEvent } from './sync-core';

export { pendingCount, reportSetAside, retrySetAside, setAside, uuidv7 } from './sync-core';
export type { AttemptEvent, SetAside } from './sync-core';

export type ProgressListener = (
  unitId: string,
  progress: { status: string; score: number | null; bestScore: number | null; revised?: string[] },
) => void;
const listeners = new Set<ProgressListener>();
const queueListeners = new Set<(n: number) => void>();

export function onProgress(fn: ProgressListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function onQueue(fn: (n: number) => void): () => void {
  queueListeners.add(fn);
  return () => queueListeners.delete(fn);
}

async function notifyQueue() {
  const n = await pendingCount().catch(() => 0);
  queueListeners.forEach((fn) => fn(n));
}

const storageListeners = new Set<() => void>();
/** Stockage de l'appareil plein (ou indisponible) : la réponse n'a pas pu être gardée (audit OFF-4). */
export function onStorageFull(fn: () => void): () => void {
  storageListeners.add(fn);
  return () => storageListeners.delete(fn);
}

/** Met une réponse en file ; null si l'appareil n'a pas pu la garder (stockage plein) — jamais d'exception. */
export async function enqueue(
  ev: Omit<AttemptEvent, 'id' | 'deviceAt'>,
): Promise<AttemptEvent | null> {
  let full: AttemptEvent;
  try {
    full = await queueEvent(ev);
  } catch {
    storageListeners.forEach((fn) => fn());
    return null;
  }
  void notifyQueue();
  void flush();
  return full;
}

export async function flush(): Promise<void> {
  const r = await flushQueue();
  for (const [unitId, p] of Object.entries(r.progress)) listeners.forEach((fn) => fn(unitId, p));
  void notifyQueue();
  if (r.offline) await requestBackgroundSync();
}

/** Demande au service worker de renvoyer la file quand le réseau reviendra (si le navigateur le permet). */
async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (
      reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
    )?.sync;
    await sync?.register('awform-sync');
  } catch {
    /* non disponible : l'envoi se fera au retour du réseau par la page */
  }
}

let started = false;
/** À appeler une fois au démarrage : renvoie la file au retour du réseau. */
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  // au retour du réseau (petit délai : la connexion n'est pas toujours prête à l'instant de l'événement)
  window.addEventListener('online', () => setTimeout(() => void flush(), 300));
  // filet de sécurité : tant que des réponses attendent et que le réseau semble là, on réessaie
  setInterval(() => {
    if (!navigator.onLine) return;
    void pendingCount()
      .then((n) => (n > 0 ? flush() : undefined))
      .catch(() => {});
  }, 5000);
  navigator.serviceWorker?.addEventListener?.('message', (e: MessageEvent) => {
    if ((e.data as { type?: string })?.type === 'awform-synced') void notifyQueue();
  });
  // garde le compte en cache pour pouvoir répondre hors ligne dès la première coupure
  void fetchMe();
  void flush();
  // lot F1 : suspensions d'urgence (masque des leçons gardées hors ligne) et signalements en attente
  void import('./signaler').then((m) => m.refreshContentState());
}

// ------------------------------------------------------------------ profils

export type DevProfile = ProfileInfo;

/** Profil actif choisi sur cet appareil (« Qui apprend ? » ou mode école), s'il y en a un. */
export async function activeProfile(): Promise<ProfileInfo | null> {
  return (await kvGet<ProfileInfo | null>('activeProfile').catch(() => undefined)) ?? null;
}
export async function setActiveProfile(p: ProfileInfo | null): Promise<void> {
  await kvSet('activeProfile', p);
}

/** Profils du compte connecté (gardés pour le hors ligne). */
export async function accountProfiles(): Promise<ProfileInfo[]> {
  return (await fetchMe())?.profiles ?? [];
}

/**
 * Profil qui répond : le profil actif ; à défaut, le seul profil du compte (adulte autonome).
 * Sans profil, les réponses ne sont pas enregistrées (la leçon reste utilisable).
 */
export async function demoProfileFor(_level: string): Promise<ProfileInfo | null> {
  const active = await activeProfile();
  if (active) return active;
  const me = (await cachedMe()) ?? (await fetchMe());
  return me && me.profiles.length === 1 ? (me.profiles[0] ?? null) : null;
}
