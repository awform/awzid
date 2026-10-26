/**
 * Récitation de Muḥammad Ayyūb dans les leçons, les vidéos vivantes, les cahiers et les Madjaliss (26/10/2026) —
 * module chargé À LA DEMANDE (import dynamique, jamais dans la coquille de l'élève).
 *
 * Toute citation du Coran que la garde rend muette est entendue avec Ayyūb, jamais avec la voix de synthèse :
 *  - la table (`/recitation/ayyub.json`, générée et contrôlée contre Tanzil par `packages/content/test/recitation-ayyub.test.ts`)
 *    donne pour la clé du texte le plan de lecture : versets (« 12:4 », « 1:1-7 ») joués EN ENTIER dans l'ordre, partie
 *    du texte du livre dite par la synthèse (« t:<empreinte> », texte mixte), Basmala de sourate (« b:S ») ; « ~ » en
 *    tête : fragment (verset entier joué, le passage du livre surligné) ;
 *  - Ayyūb SEUL (récitation stockée du Complexe, servie par notre API ; jamais un récitateur en ligne) ; l'élève règle la
 *    lecture avec le petit lecteur de l'application (pause, ±5 s, vitesse : décision du client du 26/10/2026) : le plan est
 *    une phrase du lecteur (`sourceRecitation`, fichiers enchaînés) ; vidéos : `jouerPlan` ;
 *  - UN SEUL lecteur audio pour tout le plan (pas un lecteur par fichier) ; hors ligne : la table gardée sur l'appareil,
 *    les versets déjà gardés (sourates téléchargées, versets écoutés), les fichiers de synthèse téléchargés ;
 *  - récitateur retiré, fichier absent, hors ligne sans copie : le segment est sauté, sans erreur.
 */
import { audioFileId } from '@awform/content/audio-cle';
import { kvGet, kvSet } from '$lib/idb';
import { leconsSource } from '$lib/lecons-audio';
import type { Source } from '$lib/lecteur/moteur.svelte';
import { loadTracks } from '$lib/quran/reciters';

/** récitateur des leçons (décision du référent : Ayyūb seul) */
export const RECITATEUR = 'ayyoub-hafs';
const TABLE_URL = '/recitation/ayyub.json';
const TABLE_KV = 'recitation.ayyub';
/** caches des récitations (mêmes que le lecteur du Coran : sourates téléchargées, versets récents) */
const CACHES = ['awzid-coran-audio-v1', 'awzid-coran-audio-recents'];

type Table = Record<string, string[]>;
let table: Promise<Table | null> | null = null;

/** Table des récitations : le réseau d'abord (puis gardée sur l'appareil), sinon la copie de l'appareil. */
export function chargerTable(fetchFn: typeof fetch = fetch): Promise<Table | null> {
  return (table ??= (async () => {
    try {
      const r = await fetchFn(TABLE_URL);
      if (r.ok) {
        const j = (await r.json()) as { t?: Table };
        if (j.t) {
          void kvSet(TABLE_KV, j.t).catch(() => {});
          return j.t;
        }
      }
    } catch {
      /* hors ligne : copie de l'appareil */
    }
    const k = await kvGet<Table>(TABLE_KV).catch(() => undefined);
    if (!k) table = null;
    return k ?? null;
  })());
}

/** Plan de récitation d'un texte du livre. */
export interface Plan {
  segments: string[];
  /** référence du plan pour le lecteur (`data-audio="r:<ref>"`) : segments joints par « | » */
  ref: string;
  /** fragment : le verset est joué en entier, le passage du livre est surligné */
  fragment: boolean;
  /** versets joués (« 12:4 », « 1:1-7 ») */
  versets: string[];
  /** une partie du texte est dite par la synthèse */
  mixte: boolean;
}

/** Plan de récitation d'un texte (null : aucune citation du Coran branchée). */
export async function planDe(texte: string): Promise<Plan | null> {
  const id = texte ? audioFileId(texte) : null;
  if (!id) return null;
  const p = (await chargerTable())?.[id.slice(0, 12)];
  if (!p?.length) return null;
  const fragment = p[0] === '~';
  const segments = fragment ? p.slice(1) : p;
  return {
    segments,
    ref: segments.join('|'),
    fragment,
    versets: segments.filter((s) => /^\d/.test(s)),
    mixte: segments.some((s) => s.startsWith('t:')),
  };
}

/** Adresse d'un verset d'Ayyūb (copie de l'appareil d'abord) ; null s'il n'est pas disponible. */
async function urlVerset(
  s: number,
  v: number,
): Promise<{ url: string; liberer?: () => void } | null> {
  const { pack } = await loadTracks(null, RECITATEUR, s);
  const f = pack?.files.find((x) => x.aya === v);
  if (!f) return null;
  try {
    if (typeof caches !== 'undefined')
      for (const nom of CACHES) {
        const hit = await (await caches.open(nom)).match(f.url, { ignoreVary: true });
        if (hit) {
          const url = URL.createObjectURL(await hit.blob());
          return { url, liberer: () => URL.revokeObjectURL(url) };
        }
      }
  } catch {
    /* cache indisponible : réseau */
  }
  return { url: f.url };
}

/** Fichiers d'un segment du plan, dans l'ordre (« b:S » : la Basmala, verset 1:1 d'Ayyūb). */
export function fichiersDu(segment: string): Array<{ s: number; v: number } | { t: string }> {
  if (segment.startsWith('t:')) return [{ t: segment.slice(2) }];
  if (segment.startsWith('b:')) return [{ s: 1, v: 1 }];
  const m = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(segment);
  if (!m) return [];
  const out: Array<{ s: number; v: number }> = [];
  for (let v = Number(m[2]); v <= Number(m[3] ?? m[2]); v++) out.push({ s: Number(m[1]), v });
  return out;
}

export interface Options {
  /** lecteur audio à employer (un seul pour tout le plan) ; créé sinon */
  audio?: HTMLAudioElement;
  /** arrêt demandé (scène changée, autre son, bouton) */
  signal?: AbortSignal;
  /** lecture en pause (vidéo) : le segment suivant attend la reprise */
  enPause?: () => boolean;
  /** appelé à chaque fichier (récitation : true ; synthèse : false) */
  surFichier?: (recitation: boolean, a: HTMLAudioElement) => void;
  /** vitesse choisie (vidéo) ; 1 par défaut */
  vitesse?: () => number;
}

/**
 * Source du LECTEUR de l'application (`data-audio="r:<plan>"`) : le premier fichier disponible du plan, puis les suivants
 * (`suite`) : versets d'Ayyūb enchaînés, partie de synthèse d'un texte mixte ; null si rien n'est disponible.
 */
export function sourceRecitation(ref: string): Promise<Source | null> {
  const fichiers = ref.split('|').flatMap(fichiersDu);
  const de = async (i: number): Promise<Source | null> => {
    for (let k = i; k < fichiers.length; k++) {
      const f = fichiers[k]!;
      const s = await ('t' in f
        ? leconsSource(f.t).catch(() => null)
        : urlVerset(f.s, f.v).catch(() => null));
      if (s) return { ...s, suite: () => de(k + 1) };
    }
    return null;
  };
  return de(0);
}

const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Joue un fichier jusqu'au bout (ou jusqu'à l'arrêt) ; false s'il n'a pas pu être joué. */
function jusquAuBout(a: HTMLAudioElement, signal?: AbortSignal): Promise<boolean> {
  return new Promise((ok) => {
    const fin = (r: boolean) => {
      a.onended = a.onerror = null;
      signal?.removeEventListener('abort', arret);
      ok(r);
    };
    const arret = () => {
      a.pause();
      fin(false);
    };
    a.onended = () => fin(true);
    a.onerror = () => fin(false);
    signal?.addEventListener('abort', arret, { once: true });
  });
}

/**
 * Joue le plan : versets d'Ayyūb (en entier, vitesse 1) et parties de synthèse, à la suite, avec UN lecteur ; renvoie
 * le nombre de fichiers réellement joués (0 : rien de disponible).
 */
export async function jouerPlan(plan: Plan, o: Options = {}): Promise<number> {
  const a = o.audio ?? new Audio();
  let joues = 0;
  for (const seg of plan.segments)
    for (const f of fichiersDu(seg)) {
      if (o.signal?.aborted) return joues;
      const src = await ('t' in f
        ? leconsSource(f.t).catch(() => null)
        : urlVerset(f.s, f.v).catch(() => null));
      if (!src) continue;
      if (o.signal?.aborted) {
        src.liberer?.();
        return joues;
      }
      a.src = src.url;
      // vitesse choisie par l'élève (décision du client du 26/10/2026 : ralentir ou accélérer, même la récitation)
      a.preservesPitch = true;
      a.defaultPlaybackRate = a.playbackRate = o.vitesse?.() ?? 1;
      o.surFichier?.(!('t' in f), a);
      while (o.enPause?.() && !o.signal?.aborted) await attendre(200);
      const fini = jusquAuBout(a, o.signal);
      try {
        await a.play();
        if (await fini) joues++;
      } catch {
        /* lecture refusée ou fichier illisible : segment sauté */
      } finally {
        src.liberer?.();
      }
    }
  return joues;
}
