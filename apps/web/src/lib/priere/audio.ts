/**
 * « La prière de A à Z » — la voix du parcours, DEUX sources seulement :
 *  - le CORAN (`audio` = `ayyub:S:V`, tout verset) : récitation STOCKÉE de Muḥammad Ayyūb, VERSET ENTIER, verset par
 *    verset ; jamais de voix de synthèse, sous aucun prétexte (la Fātiḥa de la prière obligatoire commence à 1:2) ;
 *  - les PAROLES (takbīr, tasbīḥ, tashahhud, adhkār, adhān…) : fichiers de synthèse du niveau « priere » (`audioIdFor` :
 *    jamais de synthèse sur un texte coranique, la garde de l'application n'est ni contournée ni assouplie) ;
 *    JAMAIS de synthèse sur une forme qui contient la basmala (règle du 20/10).
 * Le mot entendu est surligné : pour une parole, d'après les silences mesurés du fichier (`calendrier.ts`) ; pour
 * Ayyūb, verset par verset. Si le son est bloqué, le surlignage continue au même rythme, sans son.
 * Un seul son à la fois ; aucune lecture automatique ; chargement des fichiers à la demande (au premier appui).
 */
import { looksQuranic } from '@awform/content/audio-cle';
import { audioIdFor, leconsSource, levelAudio, type LevelAudio } from '$lib/lecons-audio';
import { loadTracks } from '$lib/quran/reciters';
import {
  calageParDefaut,
  calendrier,
  dureeEstimee,
  mots,
  motActif,
  type Calage,
  type Plage,
} from './calendrier';
import { chargerCalage } from './donnees';

/** récitateur conseillé aux débutants : récitation stockée du Complexe (verset entier) */
export const RECITATEUR = 'ayyoub-hafs';
/** niveau d'audio du parcours (liste des fichiers de synthèse des paroles, côté serveur) */
export const NIVEAU_AUDIO = 'priere';

export interface RefVerset {
  s: number;
  v: number;
}
export type SourceAudio =
  | { type: 'ayyub'; refs: RefVerset[] }
  /** voix de synthèse : `id` = fichier existant, null = « audio en préparation » */
  | { type: 'tts'; id: string | null }
  /** jamais de voix : `basmala` (règle du 20/10) ou `coran` (graphie du Muṣḥaf) */
  | { type: 'interdit'; raison: 'basmala' | 'coran' }
  | { type: 'aucun' };

/** « ayyub:1:2-7 » → 1:2 … 1:7 ; « ayyub:basmala » → 1:1 (le fichier annexe de la basmala est le verset 1:1) */
export function refsAyyub(audio: string | readonly string[] | undefined): RefVerset[] {
  const out: RefVerset[] = [];
  for (const a of Array.isArray(audio) ? audio : audio ? [audio as string] : []) {
    if (a === 'ayyub:basmala') {
      out.push({ s: 1, v: 1 });
      continue;
    }
    const m = /^ayyub:(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(a);
    if (!m) continue;
    const [s, d, f] = [Number(m[1]), Number(m[2]), Number(m[3] ?? m[2])];
    for (let v = d; v <= f; v++) out.push({ s, v });
  }
  return out;
}

/** La basmala (avec ou sans voyelles, graphie du Muṣḥaf comprise) : jamais de synthèse. */
export function contientBasmala(ar: string): boolean {
  const nu = ar
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\u0671/g, '\u0627')
    .replace(/\s+/g, ' ');
  return /\u0628\u0633\u0645 \u0627\u0644+\u0647/.test(nu);
}

/** Interdit à la synthèse : la basmala, ou une graphie du Muṣḥaf. */
export const interditSynthese = (ar: string): 'basmala' | 'coran' | null =>
  contientBasmala(ar) ? 'basmala' : looksQuranic(ar) ? 'coran' : null;

/**
 * Source de la voix d'une parole. Tout verset passe par Ayyūb ; une parole « tts » n'est jamais lue par la synthèse si
 * son texte est interdit (basmala, graphie du Muṣḥaf) ou si le fichier n'existe pas encore.
 */
export function sourceAudio(
  p: { audio?: string | readonly string[]; ar?: string },
  la: LevelAudio | null,
): SourceAudio {
  const refs = refsAyyub(p.audio);
  if (refs.length) return { type: 'ayyub', refs };
  if (p.audio !== 'tts' || !p.ar) return { type: 'aucun' };
  const raison = interditSynthese(p.ar);
  if (raison) return { type: 'interdit', raison };
  return { type: 'tts', id: audioIdFor(p.ar, la) };
}

// ------------------------------------------------------------------ lecture

export type Fin = 'fini' | 'arret' | 'sans-son';
export interface OptsLecture {
  signal?: AbortSignal;
  /** début et fin (secondes) du passage joué, dans le fichier */
  debut?: number;
  fin?: number;
  /** appelée à chaque image : temps (s) dans le fichier et durée du fichier */
  surTemps?: (t: number, duree: number) => void;
  /** durée estimée (s) si le son ne peut pas être joué */
  secours?: number;
}

let courant: { stop: () => void } | null = null;
let enCours = false;

/** Arrête le son du parcours. */
export function arreterSon(): void {
  courant?.stop();
}
if (typeof document !== 'undefined')
  document.addEventListener('awzid-son', () => {
    // un autre son de l'application commence (leçon, lecteur) : le nôtre s'arrête
    if (!enCours) arreterSon();
  });

/** Jusqu'à la fin d'un passage, avec ou sans fichier (lecture bloquée, fichier absent : même rythme, sans son). */
function lire(url: string | null, o: OptsLecture): Promise<Fin> {
  arreterSon();
  enCours = true;
  document.dispatchEvent(new Event('awzid-son'));
  enCours = false;
  return new Promise<Fin>((ok) => {
    let raf = 0;
    let fini = false;
    let a: HTMLAudioElement | null = null;
    let t0 = 0;
    let simule = false;
    const debut = o.debut ?? 0;
    const terminer = (r: Fin) => {
      if (fini) return;
      fini = true;
      cancelAnimationFrame(raf);
      try {
        a?.pause();
      } catch {
        /* rien */
      }
      if (courant === jeton) courant = null;
      ok(simule && r === 'fini' ? 'sans-son' : r);
    };
    const jeton = { stop: () => terminer('arret') };
    courant = jeton;
    o.signal?.addEventListener('abort', () => terminer('arret'), { once: true });
    if (o.signal?.aborted) return terminer('arret');
    const fin = () => o.fin ?? (simule || !a ? debut + (o.secours ?? 2) : a.duration || debut + 2);
    const pas = () => {
      if (fini) return;
      const t = simule || !a ? debut + (performance.now() - t0) / 1000 : a.currentTime;
      const f = fin();
      o.surTemps?.(t, simule || !a ? f : a.duration || f);
      if (t >= f - 0.02 || (!simule && a?.ended)) return terminer('fini');
      raf = requestAnimationFrame(pas);
    };
    const simuler = () => {
      if (fini || simule) return;
      simule = true;
      t0 = performance.now();
      raf = requestAnimationFrame(pas);
    };
    if (!url) return simuler();
    a = new Audio(url);
    a.preservesPitch = true;
    // 26/10/2026 : la pastille du lecteur pilote ce son (pause, ±5 s, vitesse) ; le surlignage suit le temps du fichier
    const pilote = a;
    void import('$lib/lecteur/ouvrir').then((m) => m.piloter(pilote)).catch(() => {});
    a.addEventListener('error', simuler, { once: true });
    const partir = () => {
      try {
        if (debut) a!.currentTime = debut;
      } catch {
        /* rien */
      }
      a!.play().then(
        () => {
          t0 = performance.now();
          raf = requestAnimationFrame(pas);
        },
        () => simuler(),
      );
    };
    if (a.readyState >= 1) partir();
    else a.addEventListener('loadedmetadata', partir, { once: true });
  });
}

/** Fichier de récitation déjà gardé sur l'appareil (sourate téléchargée, verset déjà écouté) ; sinon le réseau. */
const CACHES_RECITATION = ['awzid-coran-audio-v1', 'awzid-coran-audio-recents'];
async function urlRecitation(url: string): Promise<{ url: string; liberer?: () => void }> {
  try {
    if (typeof caches !== 'undefined')
      for (const nom of CACHES_RECITATION) {
        const hit = await (await caches.open(nom)).match(url, { ignoreVary: true });
        if (hit) {
          const u = URL.createObjectURL(await hit.blob());
          return { url: u, liberer: () => URL.revokeObjectURL(u) };
        }
      }
  } catch {
    /* cache indisponible : réseau */
  }
  return { url };
}

/**
 * La voix du parcours : prépare la liste des fichiers de synthèse, le calage mesuré et le profil, puis lit.
 * Une instance par écran ; `arreter()` à la sortie.
 */
export class Voix {
  la: LevelAudio | null = null;
  calage: Record<string, Calage> = {};
  /** profil pour la liste des récitateurs autorisés */
  profil: string | null;
  private pret: Promise<void> | null = null;
  private controleur: AbortController | null = null;
  constructor(profil: string | null) {
    this.profil = profil;
  }
  preparer(): Promise<void> {
    this.pret ??= Promise.all([
      levelAudio(NIVEAU_AUDIO).then((a) => (this.la = a)),
      chargerCalage().then((c) => (this.calage = c)),
    ]).then(() => undefined);
    return this.pret;
  }
  source(p: { audio?: string | readonly string[]; ar?: string }): SourceAudio {
    return sourceAudio(p, this.la);
  }
  /** Signal d'une nouvelle lecture : annule la précédente. */
  private nouveau(): AbortSignal {
    this.controleur?.abort();
    this.controleur = new AbortController();
    return this.controleur.signal;
  }
  arreter(): void {
    this.controleur?.abort();
    this.controleur = null;
    arreterSon();
  }

  /**
   * Dit une parole de synthèse, mot à mot. `passage` = [premier mot, dernier mot] pour ne jouer qu'un passage ;
   * `surMot` reçoit le mot entendu (−1 : aucun) ; `surProgres` la fraction jouée.
   */
  async dire(
    ar: string,
    id: string | null,
    o: {
      signal?: AbortSignal;
      passage?: [number, number];
      surMot?: (i: number) => void;
      surProgres?: (f: number) => void;
    } = {},
  ): Promise<Fin> {
    await this.preparer();
    const signal = o.signal ?? this.nouveau();
    const liste = mots(ar);
    const src = id ? await leconsSource(id).catch(() => null) : null;
    const estimee = dureeEstimee(ar);
    // calage mesuré du fichier ; sans mesure, tout le son est utile (durée lue dans le fichier, sinon estimée)
    let plan: Plage[] | null =
      id && src && this.calage[id] ? calendrier(liste, this.calage[id]) : null;
    const assurer = (duree: number) => {
      plan ??= calendrier(liste, calageParDefaut(duree));
      return plan;
    };
    // sans fichier, ou passage d'un fichier non mesuré : rythme estimé
    if (!src || (o.passage && !plan)) assurer(estimee);
    const [d, f] = o.passage ?? [0, liste.length - 1];
    const debut = o.passage && plan ? plan[d]![0] : undefined;
    const fin = o.passage && plan ? plan[f]![1] : undefined;
    let dernier = -2;
    const res = await lire(src?.url ?? null, {
      signal,
      debut,
      fin,
      secours: debut !== undefined && fin !== undefined ? fin - debut : estimee,
      surTemps: (t, duree) => {
        const i = motActif(assurer(duree), t);
        if (i !== dernier) {
          dernier = i;
          o.surMot?.(i >= d && i <= f ? i : -1);
        }
        const a = debut ?? 0;
        const b = fin ?? duree;
        o.surProgres?.(Math.min(1, Math.max(0, (t - a) / Math.max(0.01, b - a))));
      },
    });
    src?.liberer?.();
    o.surMot?.(-1);
    return res;
  }

  /** Récite un verset entier (Ayyūb) ; rejette si la récitation n'est pas disponible. */
  async reciter(
    ref: RefVerset,
    o: { signal?: AbortSignal; surProgres?: (f: number) => void } = {},
  ): Promise<Fin> {
    const signal = o.signal ?? this.nouveau();
    const { pack } = await loadTracks(this.profil, RECITATEUR, ref.s);
    const f = pack?.files.find((x) => x.aya === ref.v);
    if (!f) throw new Error('recitation indisponible');
    const src = await urlRecitation(f.url);
    let derniere = -1;
    const r = await lire(src.url, {
      signal,
      secours: f.durationMs / 1000 || 4,
      surTemps: (t, duree) => {
        const p = Math.min(1, t / Math.max(0.01, duree));
        if (p !== derniere) {
          derniere = p;
          o.surProgres?.(p);
        }
      },
    });
    src.liberer?.();
    return r;
  }
}
