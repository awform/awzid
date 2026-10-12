/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker (lot 3 : hors ligne complet)
 *  - coquille de l'application (JS, CSS, polices, icônes, page de démarrage) mise en cache à l'installation ;
 *  - toute navigation sans réseau reçoit la coquille : l'application monopage lit ensuite les paquets de
 *    niveau dans IndexedDB ;
 *  - nouvelle version : téléchargée en arrière-plan, puis appliquée quand l'élève touche « Mettre à jour », ou
 *    seule au démarrage à froid ou après un délai, toujours sur un écran neutre (message SKIP_WAITING, voir
 *    `lib/maj.ts`) ; à l'activation, tous les onglets sont prévenus et se rechargent (jamais au milieu d'une
 *    leçon : l'onglet occupé garde les fichiers de la version précédente jusqu'à son retour à un écran neutre) ;
 *  - Background Sync « awform-sync » : renvoie la file des réponses quand le réseau revient, même page fermée.
 * Les réponses de l'API ne sont pas mises en cache ici (les paquets vivent dans IndexedDB).
 */
import { build, files, version } from '$service-worker';
import { get } from '$lib/idb';
import { flushQueue } from '$lib/sync-core';
import { purgeOldRecordings } from '$lib/recordings';
import { CACHE_RIWAYAT, cachesARetirer, PREFIXE_COQUILLE } from '$lib/maj-caches';

// mêmes valeurs que `lib/maj.ts` (non importé ici : le worker reste léger)
const MSG_SKIP = 'SKIP_WAITING';
const MSG_VERSION = 'AWZID_VERSION';
const MSG_ACTIVE = 'AWZID_ACTIVE';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `${PREFIXE_COQUILLE}${version}`;
const SHELL = '/';
// lot 25 : les catalogues de langues (/i18n/*.json) ne sont pas préchargés : seul celui qui sert est gardé
const isCatalog = (p: string) => p.startsWith('/i18n/');
// A37/A39 : textes légaux hors coquille, copiés après l'activation (voir legalCopy)
const LEGAL = ['/i18n/legal/fr.json', '/i18n/legal/en.json'];
// lot 29 : les annotations du tajwid (une par sourate) ne sont pas préchargées : chargées à la demande et
// gardées dans IndexedDB par l'application (hors ligne ensuite)
const isTajwid = (p: string) => p.startsWith('/tajwid/');
// Muṣḥaf par page : traductions du sens (une par sourate) chargées à la demande, gardées dans IndexedDB
const isTraduction = (p: string) => p.startsWith('/traductions/');
// A8 : muṣḥafs des riwāyāt (texte par sourate et police du Complexe) chargés à la demande seulement
const isRiwaya = (p: string) => p.startsWith('/riwayat/');
// … la police d'une riwāya, une fois chargée, est gardée (hors ligne ensuite) dans un cache à part, conservé
// aux mises à jour (le nom du fichier change avec la version du Complexe)
const RIWAYAT_CACHE = CACHE_RIWAYAT;
// Madjaliss : textes (mutūn) chargés à la demande, gardés dans IndexedDB par l'application au premier usage
const isMutun = (p: string) => p.startsWith('/mutun/');
// A37 : textes français des espaces de l'élève chargés par route (Prières, Vivre l'islam) : préchargés, eux
const STUDENT_TEXTS = [
  '/i18n/fr-quotidien.json',
  '/i18n/fr-vivre.json',
  '/i18n/fr-coran.json',
  '/i18n/fr-hifz.json',
];
const ASSETS = [
  ...build,
  ...files.filter(
    (f) =>
      !f.endsWith('.txt') &&
      (!isCatalog(f) || STUDENT_TEXTS.includes(f)) &&
      !isTajwid(f) &&
      !isTraduction(f) &&
      !isRiwaya(f) &&
      !isMutun(f),
  ),
];

/**
 * A27 (décision D-F2 9), F5 : fichiers qui ne servent QU'AUX pages du personnel (enseignant, direction, admin),
 * aux pages RARES utiles en ligne seulement (offres, abonnement, inscription, certificats…) et aux modules chargés
 * à la demande qui ont besoin du réseau (Muṣḥaf exact, tuteur, avis) et aux pages de l'élève gardées AU PREMIER
 * USAGE (Madjaliss : hors ligne après la première ouverture) — listés à la construction
 * (`groupes.json`, scripts/groupes.mjs) : jamais préchargés sur l'appareil d'un élève ; gardés au premier usage.
 * Liste absente : tout est préchargé, comme avant.
 */
async function horsEleve(): Promise<Set<string>> {
  try {
    const r = await fetch('/groupes.json', { cache: 'no-store' });
    if (!r.ok) return new Set();
    const j = (await r.json()) as Record<string, unknown>;
    return new Set(
      ['personnel', 'rares', 'enLigne', 'premierUsage'].flatMap((g) =>
        Array.isArray(j[g]) ? (j[g] as unknown[]).map(String) : [],
      ),
    );
  } catch {
    return new Set();
  }
}

/**
 * A21b : code des leçons vivantes (générateurs, lecteur, modèles ; liste écrite à la construction par
 * vite.config.ts) — pas dans la coquille ; gardé dans le cache de cette version au premier usage ou au
 * téléchargement d'un niveau d'arabe (voir le traitement des fichiers non préchargés plus bas).
 */
async function vivante(): Promise<Set<string>> {
  try {
    const r = await fetch('/_app/vivante.json', { cache: 'no-store' });
    return new Set(r.ok ? ((await r.json()) as string[]).map(String) : []);
  } catch {
    return new Set();
  }
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([horsEleve(), vivante()]).then(async ([staff, viv]) => {
      const c = await caches.open(CACHE);
      await c.addAll([...ASSETS.filter((a) => !staff.has(a) && !viv.has(a)), SHELL]);
    }),
  );
});

// Messages acceptés, envoyés par l'application d'une page de ce site (voir `lib/maj.ts`) :
//  - « Mettre à jour » (ou application automatique sur un écran neutre) : le worker en attente prend la main ;
//  - demande de version (canal de réponse) : chaque onglet sait si le worker actif est celui de sa version.
sw.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | null)?.type;
  if (type === MSG_SKIP) void sw.skipWaiting();
  else if (type === MSG_VERSION) event.ports[0]?.postMessage({ version });
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // seuls des caches de FICHIERS sont retirés (jamais IndexedDB ni localStorage : signets, progression,
      // réglages) ; la coquille précédente reste le temps qu'un onglet occupé revienne à un écran neutre ;
      // lot 27, A34 : sourates, Muṣḥaf exact et polices gardés par l'utilisateur survivent aux mises à jour
      .then((keys) => Promise.all(cachesARetirer(keys, CACHE).map((k) => caches.delete(k))))
      // enregistrements locaux de plus de 7 jours : effacés même si l'écran n'est jamais rouvert (MIN-16)
      .then(() => purgeOldRecordings().catch(() => 0))
      .then(() => sw.clients.claim())
      // incident du 12/10/2026 : TOUS les onglets de l'origine sont prévenus (ils se rechargent sur un écran
      // neutre), même ceux qui n'étaient pas contrôlés
      .then(() => sw.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((cs) => cs.forEach((c) => c.postMessage({ type: MSG_ACTIVE, version })))
      // D-A39 (5) : pages légales et aide (hors coquille) gardées dès la première ouverture, sans bloquer
      .then(() => void legalCopy()),
  );
});

/** Copie discrète des textes légaux (français, anglais) dans le cache de cette version, pour le hors ligne. */
async function legalCopy() {
  const c = await caches.open(CACHE);
  for (const p of LEGAL)
    if (!(await c.match(p)))
      await fetch(p)
        .then((r) => (r.ok ? c.put(p, r) : undefined))
        .catch(() => undefined);
}

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
  if (url.pathname.startsWith('/_app/immutable/') && !ASSETS.includes(url.pathname)) {
    // fichier de la version PRÉCÉDENTE (onglet resté en leçon pendant la mise à jour) : son cache est encore là
    event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
    return;
  }
  if (ASSETS.includes(url.pathname)) {
    // fichier non préchargé (personnel, pages rares, modules en ligne, leçons vivantes) : réseau, puis gardé dans le cache de cette version
    // cherché dans le cache de CETTE version seulement : la coquille précédente, gardée un temps, a des fichiers
    // de même nom (icônes, catalogues) qui ne doivent jamais revenir
    event.respondWith(
      enCache(url.pathname).then(
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
          u ? Response.redirect(`/lecons/${unitId}`, 302) : fetch(req).catch(coquille),
        ),
    );
    return;
  }
  if (req.mode === 'navigate') {
    // réseau d'abord (contenu à jour), coquille en cache si pas de réseau
    event.respondWith(fetch(req).catch(coquille));
  }
});

/** Fichier du cache de la version active (jamais celui d'une version précédente). */
function enCache(p: string): Promise<Response | undefined> {
  return caches.open(CACHE).then((c) => c.match(p));
}
/** Coquille de la version active, servie aux navigations sans réseau. */
async function coquille(): Promise<Response> {
  return (await enCache(SHELL)) ?? Response.error();
}

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
    sw.registration.showNotification(p.title ?? 'Awzid', {
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
