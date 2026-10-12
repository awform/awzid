/**
 * Mise à jour fiable de l'application (bêta-support, puis incident du 12/10/2026 : 23 onglets ouverts, le
 * téléphone du client restait sur une ANCIENNE version après un déploiement).
 *
 *  - une nouvelle version, téléchargée en arrière-plan par le service worker, est annoncée par un bandeau
 *    PERSISTANT « Nouvelle version disponible — Mettre à jour » ;
 *  - un toucher fait prendre la main au nouveau worker (`skipWaiting`, puis `clients.claim` dans le worker) et
 *    TOUS les onglets de l'origine se rechargent (changement de contrôleur, message du worker, BroadcastChannel) ;
 *  - sans geste de l'élève, la version s'applique seule : au démarrage à froid (version déjà en attente) ou après
 *    `DELAI_AUTO_MS` ; JAMAIS pendant une leçon, une récitation, une écoute ou un exercice : l'onglet occupé
 *    attend un écran neutre pour se recharger ;
 *  - la présence d'une nouvelle version est aussi vérifiée au retour au premier plan (`visibilitychange`).
 * Rien de ce qui est gardé sur l'appareil (IndexedDB, localStorage : signets, progression, réglages) n'est touché :
 * seuls les caches de fichiers de l'ancienne version sont retirés (voir `service-worker.ts`, `cachesARetirer`).
 *
 * Ce module est PUR (aucune dépendance de Svelte) : décisions testées sans navigateur, branchements du service
 * worker injectés.
 */

/**
 * Pages où l'élève est EN TRAIN d'apprendre : leçon, épreuve, positionnement, révision, hifẓ, récital, écriture,
 * mémorisation, activités et lectures guidées. Aucun rechargement n'y a lieu : il attend la fin (retour à une
 * autre page).
 */
const PAGES_EN_COURS = [
  /^\/lecons\/[^/]+/,
  /^\/epreuves\/[^/]+/,
  /^\/epreuve-passage(\/|$)/,
  /^\/positionnement(\/|$)/,
  /^\/revisions(\/|$)/,
  /^\/hifz(\/|$)/,
  /^\/recital(\/|$)/,
  /^\/ecriture\/[^/]+/,
  /^\/coran\/memoriser(\/|$)/,
  /^\/activites\/[^/]+/,
  /^\/lectures\/[^/]+/,
];
export const pageEnCours = (chemin: string): boolean => PAGES_EN_COURS.some((r) => r.test(chemin));

/** Une écoute (audio ou vidéo) est-elle en cours dans le document ? */
export function mediaEnCours(doc: Pick<Document, 'querySelectorAll'>): boolean {
  for (const m of doc.querySelectorAll<HTMLMediaElement>('audio, video'))
    if (!m.paused && !m.ended) return true;
  return false;
}

/**
 * Le bandeau est montré si une version attend, en ligne, hors lecture/leçon, et pas juste après une mise à jour.
 * Persistant : aucun « Plus tard » (incident du 12/10/2026).
 */
export function doitAfficher(e: {
  prete: boolean;
  occupe: boolean;
  enLigne: boolean;
  recente: boolean;
}): boolean {
  return e.prete && !e.occupe && e.enLigne && !e.recente;
}

/** Une mise à jour ignorée s'applique seule après ce délai (sur un écran neutre seulement). */
export const DELAI_AUTO_MS = 10 * 60_000;

/**
 * Application AUTOMATIQUE (sans toucher le bandeau) : jamais si l'élève est occupé, hors ligne, ni juste après une
 * mise à jour ;
 * tout de suite si la version attendait déjà au démarrage (chargement à froid) ; sinon après `DELAI_AUTO_MS`.
 */
export function doitAppliquerSeul(e: {
  prete: boolean;
  occupe: boolean;
  enLigne: boolean;
  recente: boolean;
  dejaLaAuDemarrage: boolean;
  depuisMs: number;
}): boolean {
  if (!e.prete || e.occupe || !e.enLigne || e.recente) return false;
  return e.dejaLaAuDemarrage || e.depuisMs >= DELAI_AUTO_MS;
}

// ------------------------------------------------------------------ garde anti-boucle

const CLE = 'awzid-maj';
/** Une mise à jour appliquée il y a moins de 2 minutes : on n'en propose pas une autre (jamais en boucle). */
export const DELAI_ANTI_BOUCLE_MS = 120_000;

interface Stockage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const session = (): Stockage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

export function majRecente(now = Date.now(), s: Stockage | null = session()): boolean {
  try {
    const t = Number(s?.getItem(CLE));
    return Number.isFinite(t) && t > 0 && now - t < DELAI_ANTI_BOUCLE_MS;
  } catch {
    return false;
  }
}
export function noterMaj(now = Date.now(), s: Stockage | null = session()): void {
  try {
    s?.setItem(CLE, String(now));
  } catch {
    /* stockage refusé : sans importance */
  }
}

// ------------------------------------------------------------------ service worker

/** Intervalle minimal entre deux vérifications de nouvelle version (retour au premier plan, minuterie). */
export const VERIF_MIN_MS = 60_000;
/** Vérification périodique pendant que l'application reste ouverte au premier plan. */
export const VERIF_PERIODE_MS = 30 * 60_000;
/** Relecture locale (sans réseau) du worker en attente. */
export const VERIF_ATTENTE_MS = 10_000;

/** Canal commun aux onglets de l'origine. */
export const CANAL = 'awzid-maj';
/** Messages échangés avec le worker (et entre onglets). */
export const MSG_SKIP = 'SKIP_WAITING';
export const MSG_VERSION = 'AWZID_VERSION';
export const MSG_ACTIVE = 'AWZID_ACTIVE';
export const MSG_RECHARGER = 'AWZID_RECHARGER';

/**
 * Surveille le service worker : `onPrete` reçoit le worker EN ATTENTE dès qu'il existe, avec `dejaLa` vrai s'il
 * attendait déjà au chargement de la page (démarrage à froid). Une première installation (aucun contrôleur) n'est
 * PAS une mise à jour. Vérifie aussi au retour au premier plan et périodiquement. Renvoie la fonction d'arrêt.
 */
export function surveillerMaj(
  conteneur: ServiceWorkerContainer,
  onPrete: (w: ServiceWorker, dejaLa: boolean) => void,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document,
  maintenant: () => number = Date.now,
): () => void {
  let arret = false;
  let derniere = maintenant();
  let reg: ServiceWorkerRegistration | null = null;
  const attente = (w: ServiceWorker | null, dejaLa: boolean) => {
    if (w && !arret && conteneur.controller) onPrete(w, dejaLa);
  };
  const suivre = (r: ServiceWorkerRegistration) => {
    attente(r.waiting, true);
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      // dans un AUTRE onglet que celui qui a lancé la vérification, le worker peut être déjà installé
      if (!w || w.state === 'installed') return attente(r.waiting ?? w, false);
      w.addEventListener('statechange', () => {
        if (w.state === 'installed') attente(w, false);
      });
    });
  };
  void conteneur.ready.then((r) => {
    if (arret) return;
    reg = r;
    suivre(r);
  });
  const verifier = () => {
    if (doc.visibilityState !== 'visible' || !reg || maintenant() - derniere < VERIF_MIN_MS) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    derniere = maintenant();
    void reg.update().catch(() => {});
  };
  doc.addEventListener('visibilitychange', verifier);
  const minuterie = setInterval(verifier, VERIF_PERIODE_MS);
  // filet : un worker en attente dont l'installation n'a pas été vue (autre onglet, événement manqué)
  const filet = setInterval(() => attente(reg?.waiting ?? null, false), VERIF_ATTENTE_MS);
  return () => {
    arret = true;
    clearInterval(minuterie);
    clearInterval(filet);
    doc.removeEventListener('visibilitychange', verifier);
  };
}

/**
 * Applique la mise à jour : le worker en attente prend la main (`skipWaiting`), puis la page est rechargée UNE
 * fois (au changement de contrôleur ; au bout de `secours` ms si rien ne vient). L'heure est notée avant : même si
 * la nouvelle version se représente, aucun second bandeau pendant 2 minutes.
 */
export function appliquerMaj(
  w: ServiceWorker,
  conteneur: Pick<ServiceWorkerContainer, 'addEventListener'>,
  recharger: () => void,
  secours = 6000,
): void {
  noterMaj();
  let fait = false;
  const une = () => {
    if (fait) return;
    fait = true;
    recharger();
  };
  conteneur.addEventListener('controllerchange', une, { once: true });
  w.postMessage({ type: MSG_SKIP });
  setTimeout(une, secours);
}

/** Demande sa version à un worker (canal de réponse) ; `null` s'il ne répond pas à temps. */
export function versionDuWorker(w: ServiceWorker, delai = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let fini = false;
    const fin = (v: string | null) => {
      if (fini) return;
      fini = true;
      resolve(v);
    };
    try {
      const canal = new MessageChannel();
      canal.port1.onmessage = (e: MessageEvent) =>
        fin(typeof (e.data as { version?: unknown })?.version === 'string' ? e.data.version : null);
      w.postMessage({ type: MSG_VERSION }, [canal.port2]);
    } catch {
      fin(null);
    }
    setTimeout(() => fin(null), delai);
  });
}

/**
 * Tous les onglets : une nouvelle version a pris la main ailleurs (autre onglet, application automatique). Appelle
 * `onNouvelle` UNE fois quand le worker actif n'est plus celui de la version de cette page : changement de
 * contrôleur (sauf la première installation), message `AWZID_ACTIVE` du worker, ou message du canal commun.
 * La page décide ensuite QUAND se recharger (jamais au milieu d'une leçon). Renvoie la fonction d'arrêt.
 */
export function suivreNouvelleVersion(
  conteneur: Pick<
    ServiceWorkerContainer,
    'addEventListener' | 'removeEventListener' | 'controller'
  >,
  versionPage: string,
  onNouvelle: () => void,
  canal: Pick<BroadcastChannel, 'addEventListener' | 'removeEventListener'> | null = null,
  demanderVersion: (w: ServiceWorker) => Promise<string | null> = versionDuWorker,
): () => void {
  let dejaControle = !!conteneur.controller;
  let signale = false;
  const une = () => {
    if (signale) return;
    signale = true;
    onNouvelle();
  };
  const autre = (v: unknown) => typeof v === 'string' && v !== versionPage;
  const changement = () => {
    const c = conteneur.controller;
    if (!dejaControle) {
      dejaControle = !!c; // première installation : pas une mise à jour
      return;
    }
    if (!c) return;
    void demanderVersion(c).then((v) => {
      // pas de réponse (ancien worker) : on suppose une nouvelle version
      if (v === null || autre(v)) une();
    });
  };
  const message = (e: Event) => {
    const d = (e as MessageEvent).data as { type?: string; version?: unknown } | null;
    if (d?.type === MSG_ACTIVE && autre(d.version)) une();
  };
  const diffusion = (e: Event) => {
    const d = (e as MessageEvent).data as { type?: string; version?: unknown } | null;
    if (d?.type === MSG_RECHARGER && (d.version === undefined || autre(d.version))) une();
  };
  conteneur.addEventListener('controllerchange', changement);
  conteneur.addEventListener('message', message);
  canal?.addEventListener('message', diffusion);
  return () => {
    conteneur.removeEventListener('controllerchange', changement);
    conteneur.removeEventListener('message', message);
    canal?.removeEventListener('message', diffusion);
  };
}

// ------------------------------------------------------------------ occupation

export { activiteEnCours, EVT_OCCUPATION, occuper } from './occupation';
