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
// lot 29 : les annotations du tajwid (une par sourate) ne sont pas préchargées : chargées à la demande et
// gardées dans IndexedDB par l'application (hors ligne ensuite)
const isTajwid = (p: string) => p.startsWith('/tajwid/');
// Muṣḥaf par page : traductions du sens (une par sourate) chargées à la demande, gardées dans IndexedDB
const isTraduction = (p: string) => p.startsWith('/traductions/');
// A8 : muṣḥafs des riwāyāt (texte par sourate et police du Complexe) chargés à la demande seulement
const isRiwaya = (p: string) => p.startsWith('/riwayat/');
// … la police d'une riwāya, une fois chargée, est gardée (hors ligne ensuite) dans un cache à part, conservé
// aux mises à jour (le nom du fichier change avec la version du Complexe)
const RIWAYAT_CACHE = 'awzid-riwayat-polices';
const ASSETS = [
  ...build,
  ...files.filter(
    (f) => !f.endsWith('.txt') && !isCatalog(f) && !isTajwid(f) && !isTraduction(f) && !isRiwaya(f),
  ),
];

/**
 * A27 (décision D-F2 9) : fichiers qui ne servent QU'AUX pages du personnel (enseignant, direction, admin),
 * listés à la construction (`personnel.json`) : jamais préchargés sur l'appareil d'un élève ; gardés au premier
 * usage (le personnel est en ligne pour son second facteur). Liste absente : tout est préchargé, comme avant.
 */
async function staffOnly(): Promise<Set<string>> {
  try {
    const r = await fetch('/personnel.json', { cache: 'no-store' });
    if (!r.ok) return new Set();
    const j = (await r.json()) as { fichiers?: unknown };
    return new Set(Array.isArray(j.fichiers) ? j.fichiers.map(String) : []);
  } catch {
    return new Set();
  }
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    staffOnly().then(async (staff) => {
      const c = await caches.open(CACHE);
      await c.addAll([...ASSETS.filter((a) => !staff.has(a)), SHELL]);
    }),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // lot 27 : les sourates gardées par l'utilisateur survivent aux mises à jour
            .filter(
              (k) =>
                k !== CACHE &&
                k !== RIWAYAT_CACHE &&
                !k.startsWith('awzid-coran-audio') &&
                // A34 : pages et polices du Muṣḥaf exact consultées (gérées par l'application)
                !k.startsWith('awzid-mushaf-exact'),
            )
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
  if (isRiwaya(url.pathname) && url.pathname.endsWith('.ttf')) {
    event.respondWith(
      caches.open(RIWAYAT_CACHE).then(async (c) => {
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
    // fichier non préchargé (pages du personnel) : réseau, puis gardé dans le cache de cette version
    event.respondWith(
      caches.match(url.pathname).then(
        (r) =>
          r ??
          fetch(req).then(async (res) => {
            if (res.ok) await (await caches.open(CACHE)).put(url.pathname, res.clone());
            return res;
          }),
      ),
    );
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
