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
import { get } from '$lib/idb';
import { flushQueue } from '$lib/sync-core';
import { purgeOldRecordings } from '$lib/recordings';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `awform-shell-${version}`;
const SHELL = '/';
// lot 25 : les catalogues de langues (/i18n/*.json) ne sont pas préchargés : seul celui qui sert est gardé
const isCatalog = (p: string) => p.startsWith('/i18n/');
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.txt') && !isCatalog(f))];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...ASSETS, SHELL])));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // lot 27 : les sourates gardées par l'utilisateur survivent aux mises à jour
            .filter((k) => k !== CACHE && !k.startsWith('awzid-coran-audio'))
            .map((k) => caches.delete(k)),
        ),
      )
      // enregistrements locaux de plus de 7 jours : effacés même si l'écran n'est jamais rouvert (MIN-16)
      .then(() => purgeOldRecordings().catch(() => 0))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;
  if (isCatalog(url.pathname)) {
    // cache d'abord, puis réseau (gardé dans le cache de cette version pour le hors ligne)
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(url.pathname);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) await c.put(url.pathname, r.clone());
        return r;
      }),
    );
    return;
  }
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
    return;
  }
  // QR code du livre (/l/en1-05) : si la leçon est déjà sur l'appareil, on l'ouvre dans l'application
  const qr = /^\/l\/([a-z]{2,3}\d{1,2})-(\d{2})$/.exec(url.pathname);
  if (req.mode === 'navigate' && qr) {
    const unitId = `${qr[1]}.l${qr[2]}`;
    event.respondWith(
      get('units', unitId)
        .catch(() => undefined)
        .then(async (u) =>
          u
            ? Response.redirect(`/lecons/${unitId}`, 302)
            : fetch(req).catch(async () => (await caches.match(SHELL)) ?? Response.error()),
        ),
    );
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

// ---------------------------------------------------------------- notifications (lot 16)
// Contenu chiffré de bout en bout par le serveur ; affichage discret, jamais de son forcé ni de vibration
// insistante ; un clic ouvre l'écran concerné.
interface PushEventLike extends ExtendableEvent {
  data: { json(): unknown } | null;
}
interface NotificationClickLike extends ExtendableEvent {
  notification: Notification;
}
sw.addEventListener('push', ((event: PushEventLike) => {
  let p: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    p = (event.data?.json() as typeof p) ?? {};
  } catch {
    p = {};
  }
  event.waitUntil(
    sw.registration.showNotification(p.title ?? 'AWFORM', {
      body: p.body ?? '',
      tag: p.tag ?? 'awform',
      data: { url: p.url && p.url.startsWith('/') ? p.url : '/aujourdhui' },
      silent: true,
    }),
  );
}) as EventListener);
sw.addEventListener('notificationclick', ((event: NotificationClickLike) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/aujourdhui';
  event.waitUntil(sw.clients.openWindow(url));
}) as EventListener);
