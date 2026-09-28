/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker minimal (lot 1) : met en cache la coquille de l'application (JS, CSS, polices, icônes)
 * pour qu'elle s'ouvre sans réseau. Les paquets de niveau (IndexedDB) et la synchronisation des
 * événements arrivent au lot 3 (hors ligne complet). Les réponses de l'API ne sont pas mises en cache ici.
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `awform-shell-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
  }
});
