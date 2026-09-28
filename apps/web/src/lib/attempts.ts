/**
 * Tentatives côté page : mise en file (IndexedDB) puis envoi immédiat si le réseau est là ; sinon envoi
 * au retour du réseau (événement « online ») ou par le service worker (Background Sync quand le navigateur
 * le permet). Profil actif : celui du mode école s'il est ouvert, sinon le profil FICTIF de démonstration
 * adapté au niveau (en attendant les comptes du lot 4).
 */
import { kvGet, kvSet } from './idb';
import { flushQueue, pendingCount, queueEvent, type AttemptEvent } from './sync-core';

export { pendingCount, uuidv7 } from './sync-core';
export type { AttemptEvent } from './sync-core';

export type ProgressListener = (
  unitId: string,
  progress: { status: string; score: number | null; bestScore: number | null },
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

export async function enqueue(ev: Omit<AttemptEvent, 'id' | 'deviceAt'>): Promise<AttemptEvent> {
  const full = await queueEvent(ev);
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
  // garde les profils en cache pour pouvoir répondre hors ligne dès la première coupure
  void devProfiles();
  void flush();
}

// ------------------------------------------------------------------ profils

export interface DevProfile {
  id: string;
  kind: 'enfant' | 'adulte';
  pseudonym: string;
}

/** Profil actif choisi sur cet appareil (mode école), s'il y en a un. */
export async function activeProfile(): Promise<DevProfile | null> {
  return (await kvGet<DevProfile | null>('activeProfile').catch(() => undefined)) ?? null;
}
export async function setActiveProfile(p: DevProfile | null): Promise<void> {
  await kvSet('activeProfile', p);
}

/** Profils fictifs de démonstration (API de développement), mis en cache pour le hors ligne. */
export async function devProfiles(): Promise<DevProfile[]> {
  try {
    const r = await fetch('/api/v1/dev/profiles');
    if (r.ok) {
      const { profiles } = (await r.json()) as { profiles: DevProfile[] };
      await kvSet('devProfiles', profiles);
      return profiles;
    }
  } catch {
    /* hors ligne : cache */
  }
  return (await kvGet<DevProfile[]>('devProfiles').catch(() => undefined)) ?? [];
}

/** Profil à utiliser pour ce niveau : profil actif (mode école), sinon profil de démonstration adapté. */
export async function demoProfileFor(level: string): Promise<DevProfile | null> {
  const active = await activeProfile();
  if (active) return active;
  const profiles = await devProfiles();
  return profiles.find((p) => p.kind === (level.startsWith('en') ? 'enfant' : 'adulte')) ?? null;
}
