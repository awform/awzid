/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker (lot 3 : hors ligne complet)
 *  - coquille de l'application (JS, CSS, polices, icônes, page de démarrage) mise en cache à l'installation ;
 *  - toute navigation sans réseau reçoit la coquille : l'application monopage lit ensuite les paquets de
 *    niveau dans IndexedDB ;
 *  - nouvelle version : téléchargée en arrière-plan et appliquée au PROCHAIN démarrage (pas de skipWaiting :
 *    jamais de changement au milieu d'une leçon) ;
 *  - Background Sync « awform-sync » : renvoie la file des réponses quand le réseau revient, même page fermée.
 * Les réponses de l'API ne sont pas mises en cache ici (les paquets vivent dans IndexedDB).
 */
import { build, files, version } from '$service-worker';
import { flushQueue } from '$lib/sync-core';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `awform-shell-${version}`;
const SHELL = '/';
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.txt'))];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...ASSETS, SHELL])));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    // réseau d'abord (contenu à jour), coquille en cache si pas de réseau
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(SHELL)) ?? Response.error()),
    );
  }
});

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

sw.addEventListener('sync', ((event: SyncEvent) => {
  if (event.tag !== 'awform-sync') return;
  event.waitUntil(
    flushQueue().then(async (r) => {
      if (r.offline) throw new Error('toujours hors ligne'); // le navigateur réessaiera
      const clients = await sw.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: 'awform-synced', sent: r.sent }));
    }),
  );
}) as EventListener);
