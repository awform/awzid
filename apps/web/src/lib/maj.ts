/**
 * Bêta-support — « Mettre à jour » : une nouvelle version de l'application attend dans le service worker
 * (téléchargée en arrière-plan, jamais appliquée seule). L'élève choisit le moment, jamais pendant une écoute ou
 * une leçon en cours, jamais hors ligne, jamais en boucle.
 *
 * Ce module est PUR (aucune dépendance de Svelte) : décisions testées sans navigateur, branchements du service
 * worker injectés.
 */

/**
 * Pages où l'élève est EN TRAIN d'apprendre : leçon, épreuve, positionnement, révision, hifẓ, récital, écriture.
 * Le bandeau y attend la fin (retour à une autre page).
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
];
export const pageEnCours = (chemin: string): boolean => PAGES_EN_COURS.some((r) => r.test(chemin));

/** Une écoute (audio ou vidéo) est-elle en cours dans le document ? */
export function mediaEnCours(doc: Pick<Document, 'querySelectorAll'>): boolean {
  for (const m of doc.querySelectorAll<HTMLMediaElement>('audio, video'))
    if (!m.paused && !m.ended) return true;
  return false;
}

/** Le bandeau est montré seulement si la version est prête, en ligne, hors lecture/leçon, et pas reporté. */
export function doitAfficher(e: {
  prete: boolean;
  occupe: boolean;
  enLigne: boolean;
  plusTard: boolean;
  recente: boolean;
}): boolean {
  return e.prete && !e.occupe && e.enLigne && !e.plusTard && !e.recente;
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

/** Intervalle minimal entre deux vérifications de nouvelle version (retour sur l'application). */
export const VERIF_MIN_MS = 30 * 60_000;

/**
 * Surveille le service worker : `onPrete` reçoit le worker EN ATTENTE dès qu'il existe (déjà installé, ou installé
 * plus tard). Une première installation (aucun contrôleur) n'est PAS une mise à jour. Renvoie la fonction d'arrêt.
 */
export function surveillerMaj(
  conteneur: ServiceWorkerContainer,
  onPrete: (w: ServiceWorker) => void,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document,
  maintenant: () => number = Date.now,
): () => void {
  let arret = false;
  let derniere = maintenant();
  let reg: ServiceWorkerRegistration | null = null;
  const attente = (w: ServiceWorker | null) => {
    if (w && !arret && conteneur.controller) onPrete(w);
  };
  const suivre = (r: ServiceWorkerRegistration) => {
    attente(r.waiting);
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') attente(w);
      });
    });
  };
  void conteneur.ready.then((r) => {
    if (arret) return;
    reg = r;
    suivre(r);
  });
  const retour = () => {
    if (doc.visibilityState !== 'visible' || !reg || maintenant() - derniere < VERIF_MIN_MS) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    derniere = maintenant();
    void reg.update().catch(() => {});
  };
  doc.addEventListener('visibilitychange', retour);
  return () => {
    arret = true;
    doc.removeEventListener('visibilitychange', retour);
  };
}

/**
 * Applique la mise à jour : le worker en attente prend la main (`skipWaiting`), puis la page est rechargée UNE
 * fois (au changement de contrôleur ; au bout de `secours` ms si rien ne vient). L'heure est notée avant :
 * même si la nouvelle version se représente, aucun second bandeau pendant 2 minutes.
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
  w.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(une, secours);
}
