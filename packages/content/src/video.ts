/**
 * Vidéos vivantes (19/10/2026, maquette validée par le client) : l'application JOUE elle-même une unité du livre
 * comme une vidéo, à partir de ce qu'elle a déjà (texte du livre, fichiers audio des textes, traductions, dessins
 * d'objets). Extension des leçons vivantes (A21, `vivante.ts`) : même règles, nouveaux types de scènes et un
 * lecteur plein écran chargé à part (`apps/web/src/lib/video/`).
 *
 * `buildVideo(leçon, options)` produit UNE liste de scènes ; les cinq MODES (par lettre, courte, longue, quiz,
 * révision) en sont des FILTRES (étiquettes `modes` de chaque scène). Un mode sans scène n'est pas proposé.
 *
 * Générique (tout le cursus, 20/10/2026) : les scènes viennent des CHAMPS du livre, jamais du niveau. Livres des
 * lettres (Adultes 1) : lettres, syllabes, mot vedette. Livres de la phrase (Adultes 2 et suivants, sans lettre
 * nouvelle) : mots-clés de lecture (`lecture.syllabes` faite de mots), phrase vedette (en tête de la version courte),
 * lexique, dialogue et sa note, « À retenir » de grammaire (`retiens` : règle puis exemple). Temps extensibles pour
 * les niveaux suivants : `cles` (liste de lignes du livre : mots-clés, lexique, demain tableaux de conjugaison ou vers
 * d'un poème), `retenir` (règle et exemple), `inter` (mot à mot), `texte` (textes longs, phrase par phrase).
 *
 * Règles (vérifiées par `test/video.test.ts` sur les 25 unités d'Adultes 1, projection élève) :
 *  - AUCUN texte n'est écrit ici : chaque chaîne affichée ou dite est une chaîne du livre, recopiée telle quelle
 *    (crochets de balisage retirés), ou un morceau d'une chaîne du livre coupé à un séparateur du livre (« | »,
 *    « • », « — »…) ; jamais normalisée (pas de NFC) : l'ordre chadda puis voyelle reste celui des données ;
 *    les textes d'interface sont des CLÉS (`vv.*`, catalogue chargé avec le lecteur) ; ce module ne contient
 *    aucun caractère arabe (codes seulement) ;
 *  - aucune phonétique latine (les champs `tr` ne sont jamais lus) ; rien des parties « Coran » ni
 *    « fiqh/adab » ; aucun personnage (illustrations d'objets seulement) ;
 *  - VOIX : seulement le fichier audio EXISTANT du texte (clé du moteur des livres), jamais une synthèse faite
 *    ici. Garde coranique (décisions du référent du 20/10/2026) : jamais de voix à partir de 4 mots consécutifs du
 *    Coran (Tanzil sans voyelles, hors formules de dhikr : liste `video-garde.ts`) ; en dessous, la voix est permise
 *    (mot de vocabulaire, mot vedette, exemple de grammaire), SAUF pour ce qui est présenté comme Coran : graphie
 *    du Muṣḥaf, référence de verset, Basmala complète (tête de sourate), texte des parties Coran, et morceau d'une
 *    sourate ou d'un verset que l'unité présente comme RÉCITATION (verset entier dans la lecture : Fātiḥa mot à
 *    mot, sourates 112 à 114…) ; un hadith ou une phrase d'adab n'est pas du Coran : voix permise ;
 *  - DHIKR : les formules de la liste blanche (`dhikr.ts`, données `data/dhikr-formules.json`) sont des adhkār,
 *    pas de la tilāwa : sonorisées, seules ou dans une phrase, sauf dans ce qui est présenté comme Coran ; le
 *    marquage `dhikr: true` d'un bloc reste valable (voix permise malgré la garde de Tanzil).
 *
 * V2 (20/10/2026, maquette validée ; option `v2`, interrupteur `video_v2` côté application) : chaque scène reçoit son
 * CHAPITRE (liste fixe `CHAPITRES`, ordre du livre), la version courte suit l'ordre du livre (mots après la phrase ou
 * le mot vedette), « Je retiens » passe après « À toi de jouer la scène ! » (« Retenir » toujours en dernier) et la
 * version courte finit par un RÉCAPITULATIF (`bilan`) fait des seuls textes qu'elle a montrés (mêmes objets : voix et
 * garde déjà décidées, rien de nouveau n'est affiché ni dit). Sans l'option : scènes de la v1, inchangées.
 */
import { audioFileId, looksQuranic, sayText, sha1Hex, skeleton } from './audio-cle.js';
import { VIDEO_GARDE, VIDEO_RECITATION } from './video-garde.js';

/**
 * V2 — chapitres : liste FIXE (titres traduits `vv.ch_*`), dans l'ordre du livre ; chaque scène en reçoit un selon sa
 * partie. Aucun contenu inventé : un chapitre ne fait que regrouper des scènes existantes.
 */
export type Chapitre = 'decouvrir' | 'lire' | 'comprendre' | 'entrainer' | 'retenir';
export const CHAPITRES: readonly Chapitre[] = [
  'decouvrir',
  'lire',
  'comprendre',
  'entrainer',
  'retenir',
];
const CHAPITRE_DE: Partial<Record<string, Chapitre>> = {
  ouverture: 'decouvrir',
  objectifs: 'decouvrir',
  lettres: 'lire',
  rappel: 'lire',
  ecriture: 'lire',
  notion: 'lire',
  lecture: 'lire',
  mots: 'comprendre',
  quiz: 'entrainer',
  dialogue: 'entrainer',
  jouer: 'entrainer',
  recap: 'retenir',
};
/** chapitre d'une scène (version courte : lettres et phrase vedette se lisent, les mots se comprennent) */
export const chapitreDe = (s: { id: string; part: string }): Chapitre =>
  s.id === 'courte-lettres' || s.id === 'courte-vedette'
    ? 'lire'
    : s.id === 'courte-mots'
      ? 'comprendre'
      : (CHAPITRE_DE[s.part] ?? 'decouvrir');

export type VideoMode = 'lettre' | 'courte' | 'longue' | 'quiz' | 'revision';
export const VIDEO_MODES: readonly VideoMode[] = ['lettre', 'courte', 'longue', 'quiz', 'revision'];
/** niveaux dont la garde coranique de la vidéo est calculée (test « garde vidéo à jour ») : seuls proposés */
export { VIDEO_NIVEAUX } from './video-niveaux.js';

/** texte arabe du livre (affiché sans crochets) ; `son` : son fichier audio existe et peut être joué */
export interface T {
  ar: string;
  son?: 1;
  /** texte de la clé audio quand il diffère de l'affichage (bulle dont les lignes « | » sont dites d'un trait) */
  dit?: string;
}
/** texte d'interface : clé du catalogue `vv.*` et ses paramètres (aucun texte écrit ici) */
export interface Cle {
  cle: string;
  n?: number;
  total?: number;
}

export type Question =
  /** `dit` absent : épreuve sans corrigé (bilan), ou texte sans fichier audio */
  | { k: 'ecoute'; dit?: T; options: string[] }
  | { k: 'chasse'; cible: string; grille: string[] }
  | {
      k: 'premiere';
      img?: string;
      suite: string;
      options: string[];
      reponse?: string;
      mot?: T;
      fr?: string;
      /** la bonne réponse, dite après la correction */
      bonne?: T;
    }
  | {
      k: 'contient';
      cible: string;
      mots: Array<{ ar: T; oui?: boolean }>;
      oui_fr?: string;
      non_fr?: string;
    }
  /** paires du livre ; `droite` : colonne décalée d'une épreuve (bilan, sans corrigé) */
  | {
      k: 'relier';
      items: Array<{ ar: T; img?: string; fr?: string }>;
      droite?: Array<{ img?: string; fr?: string }>;
    }
  | { k: 'vf'; img?: string; ar: T; fr?: string; vrai?: boolean; correction?: T }
  /** `ordre` : indices des morceaux dans l'ordre de la phrase du livre (calculé, vérifié) */
  | { k: 'ordre'; mots: string[]; phrase?: T; fr?: string; ordre?: number[] }
  /** `mot` : le mot entier, s'il est écrit tel quel ailleurs dans la leçon (sinon les morceaux restent séparés) */
  | {
      k: 'complete';
      avant: string;
      apres: string;
      options: string[];
      reponse?: string;
      fr?: string;
      mot?: T;
      bonne?: T;
    };

/** temps d'une scène, joués dans l'ordre ; `ms` : durée minimale (le son, plus long, l'allonge) */
export type Temps = { ms: number } &
  /** `noms` : noms des lettres du titre ou du tableau, dits l'un après l'autre */
  (
    | { k: 'titre'; fr?: string; ar?: T; tableau?: T[]; noms?: T[] }
    /** `dit` : la bulle entière, dite d'un trait quand ses lignes n'ont pas chacune leur fichier */
    | { k: 'bulle'; lignes: T[]; dit?: T; fr?: string; qui?: string; cote?: 0 | 1 }
    | { k: 'objectif'; ar?: T; fr?: string }
    /** grande lettre (tracé seulement si ses traits sont validés, côté lecteur) */
    | { k: 'trace'; l: string }
    | { k: 'nom'; nom: T; consigne: Cle }
    | { k: 'points'; ar?: T; fr?: string }
    | { k: 'formes'; formes: string[] }
    | { k: 'rangee'; items: T[]; consigne?: Cle; aToi?: number }
    | { k: 'joindre'; morceaux: T[]; mot: T; fr?: string }
    | { k: 'texte'; ar: T; fr?: string; taille: 'g' | 'm' | 'p' }
    /** mot à mot du livre : morceaux coupés à « | » (arabe et français, même nombre) */
    | { k: 'inter'; ar: T[]; fr: string[] }
    | { k: 'mot'; ar: T; fr?: string; img?: string }
    | { k: 'grille'; items: Array<{ ar: T; img?: string }> }
    | { k: 'regle'; titre_ar?: T; titre_fr?: string; signe?: string; ar?: T[]; fr?: string[] }
    /** texte français du livre (consigne, conseil) toujours visible */
    | { k: 'fr'; fr: string }
    | { k: 'lettres'; items: Array<{ l: string; nom?: T }> }
    | { k: 'aToi'; consigne: Cle; puis?: T[] }
    | { k: 'q'; q: Question; i: number; n: number }
    | { k: 'jouer'; repliques: Array<{ qui: string; qui_ar: string; ar: T; fr?: string }> }
    /**
     * liste de mots ou d'expressions du livre, une ligne chacun (mots-clés de lecture, lexique ; demain : tableaux de
     * conjugaison, vers d'un poème…) ; `dits` : morceaux dits un à un quand la ligne entière n'a pas de fichier audio
     */
    | { k: 'cles'; items: Ligne[] }
    /** « À retenir » de grammaire : la règle du livre (français), puis son exemple arabe sur sa ligne */
    | { k: 'retenir'; fr?: string; ar?: T }
    /** V2 — récapitulatif final : ce que la vidéo a montré (mêmes objets ; ce qui a un audio est redit) */
    | { k: 'bilan'; lettres: T[]; vedette?: T; mots: Array<{ ar: T; img?: string }> }
  );
/** ligne d'une liste du livre : texte arabe (avec parfois un mot français du livre), morceaux dits, sens */
export interface Ligne {
  ar: T;
  dits?: T[];
  fr?: string;
}

export type VideoPart =
  | 'ouverture'
  | 'objectifs'
  | 'lettres'
  | 'ecriture'
  | 'notion'
  | 'lecture'
  | 'mots'
  | 'quiz'
  | 'dialogue'
  | 'recap'
  | 'jouer'
  | 'rappel'
  | 'resume';

export interface Scene {
  id: string;
  part: VideoPart;
  /** titre : texte du livre (`fr`) ou clé d'interface */
  titre: Cle | { fr: string };
  modes: VideoMode[];
  temps: Temps[];
  /** exercice jouable à l'écran (corrigé présent dans les données) */
  jouable?: true;
  /** rang de la lettre (mode « par lettre ») */
  lettre?: number;
  /**
   * textes affichés de la scène qui ont un fichier audio : le lecteur les dit si rien d'autre ne l'a été (règle du
   * client : aucune scène muette quand un texte affiché a sa voix ; choix d'un exercice, lettres d'une grille…)
   */
  voix?: T[];
  /** V2 — chapitre de la scène (liste fixe `CHAPITRES`) */
  chapitre?: Chapitre;
}

export interface Signalement {
  texte: string;
  raison: 'coran' | 'basmala' | 'sacre' | 'contexte';
}

export interface VideoLecon {
  unitId: string;
  /** empreinte SHA-1 de la leçon reçue et de la liste des audios du niveau (cache du lecteur) */
  source: string;
  type: 'lecon' | 'bilan' | 'examen';
  numero?: number;
  scenes: Scene[];
  /** modes proposés (au moins une scène), dans l'ordre de `VIDEO_MODES` */
  modes: VideoMode[];
  /** lettres du mode « par lettre » : rang de la scène, lettre */
  lettres: Array<{ scene: number; l: string }>;
  /** textes privés de voix par la garde (Coran, Basmala sans marque…) */
  signalements: Signalement[];
  /** textes qui seraient dits mais n'ont pas de fichier audio (audit), avec la partie où ils sont montrés */
  sansSon: Array<{ texte: string; part: VideoPart }>;
}

/**
 * Lettre(s) détachée(s) : aucun mot du texte n'a deux lettres de base (une seule lettre, ou plusieurs lettres isolées par des espaces) ; une lettre détachée n'est jamais
 * lue par la synthèse (noms de lettres : assemblage). Définie ici et non dans `audio-cle` (poids de l'appareil de l'élève).
 */
export const lettresDetachees = (text: string): boolean =>
  !/[\u0621-\u064A\u0671][\u064B-\u0670\u06D6-\u06ED\u0640]*[\u0621-\u064A\u0671]/.test(text);

export interface VideoOptions {
  unitId: string;
  /** le texte a-t-il un fichier audio dans le niveau ? */
  hasAudio?: (text: string) => boolean;
  /**
   * fichiers (SHA-1 de la clé audio) dont le serveur autorise la voix malgré la graphie du Muṣḥaf : sa liste blanche
   * (`autorises` du niveau). Relâche seulement le blocage de la graphie du Muṣḥaf et `VIDEO_GARDE` pour ces textes ; jamais
   * pour une lettre détachée (ni un verset entier : la liste n'en a aucun). Absent : aucun texte autorisé
   */
  autorises?: readonly string[];
  /** clés d'illustration disponibles */
  images?: ReadonlySet<string> | readonly string[];
  /** liste des fichiers audio du niveau (empreinte `source`) */
  audioList?: readonly string[];
  /** garde coranique de la vidéo (tests : liste recalculée) ; par défaut `video-garde.ts` */
  garde?: ReadonlySet<string>;
  /** textes de la lecture présentés comme récitation (versets entiers) ; par défaut `video-garde.ts` */
  recitation?: ReadonlySet<string>;
  /**
   * V2 (interrupteur `video_v2`) : chapitres, ordre du livre dans la version courte, « Retenir » en dernier,
   * récapitulatif final. Absent : scènes de la v1, inchangées.
   */
  v2?: boolean;
}

// ———————————————————————————— durées (ms), lecture lente d'un adulte débutant ————————————————————————————
export const MS = {
  titre: 3200,
  tableauItem: 550,
  bulleLigne: 1800,
  objectif: 3800,
  trace: 2600,
  nom: 2600,
  points: 3000,
  formes: 4800,
  rangeeItem: 1500,
  joindreItem: 1300,
  joindre: 2600,
  mot: 4000,
  grille: 2500,
  aToi: 4500,
  aToiPuis: 1300,
  question: 12_000,
  bulle: 2400,
  fr: 3000,
};
export const LETTRE_MIN_MS = 30_000;
export const LETTRE_MAX_MS = 60_000;
export const COURTE_MIN_MS = 60_000;
export const COURTE_MAX_MS = 120_000;

// caractères désignés par leur code (le module ne contient aucun caractère arabe)
const ch = String.fromCharCode;
const cls = (...r: Array<[number, number] | number>) =>
  r.map((x) => (typeof x === 'number' ? ch(x) : `${ch(x[0])}-${ch(x[1])}`)).join('');
/** écriture arabe (U+0600–U+06FF) */
const ARABIC = new RegExp(`[${cls([0x600, 0x6ff])}]`);
/** lettre arabe (U+0621–U+064A, alif waṣla U+0671) */
const LETTER = new RegExp(`[${cls([0x621, 0x64a], 0x671)}]`);
const NON_LETTRE = new RegExp(`[^${cls([0x621, 0x64a], 0x671)}]`, 'g');
/** séparateurs du livre entre deux morceaux d'une même ligne */
const SEP = /\s+[|/●•·—–]\s+/;
/** séparateurs d'une ligne de liste (mots-clés, lexique) : ceux du livre, flèches, « = », « + », « : », jīm (pluriel) */
const DECOUPE = new RegExp(`\\s+(?:[|/●•·—–←→=+:]|${ch(0x62c)})\\s+`);
const LATIN = /[A-Za-z]/;
/** ponctuation retirée pour comparer des suites de mots (jamais affichée) : latine et arabe (U+060C, U+061B, U+061F) */
const PONCT = new RegExp(`[|.,:;!?«»"()…—–=+←${cls(0x60c, 0x61b, 0x61f)}]`, 'g');
/** citation entre crochets ornés du Coran (U+FD3E, U+FD3F) */
const ORNE = new RegExp(`[${cls(0xfd3e, 0xfd3f)}]`);
/** squelette de la Basmala complète (1:1, tête de sourate), alifs effacés par `skeleton` */
const BASMALA = ch(
  ...[0x628, 0x633, 0x645, 0x20, 0x644, 0x644, 0x647, 0x20],
  ...[0x644, 0x631, 0x62d, 0x645, 0x646, 0x20, 0x644, 0x631, 0x62d, 0x64a, 0x645],
);
/** référence de verset (« 49:10 », « 112:1-4 ») portée par le bloc du texte */
const VERSET = /\d{1,3}\s*:\s*\d{1,3}/;

type Obj = Record<string, unknown>;
const str = (x: unknown): string | undefined =>
  typeof x === 'string' && x.trim() !== '' ? x : undefined;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});
const strs = (x: unknown): string[] => arr(x).filter((s): s is string => typeof s === 'string');
export const unmark = (s: string) => s.replace(/[[\]]/g, '');
/** morceaux balisés [..] d'une chaîne du livre (mot vedette « [x][y][z] ») */
const balises = (s: string) => (s.match(/\[[^\]]+\]/g) ?? []).map((m) => m.slice(1, -1));
const nWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const allStr = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(allStr) : [];
/** suite de mots d'un texte, pour comparer (signes du Muṣḥaf et ponctuation retirés ; jamais affichée) */
const motsDe = (s: string) =>
  sayText(unmark(s))
    .replace(PONCT, ' ')
    .split(/\s+/)
    .filter((w) => LETTER.test(w))
    .join(' ');

/** personnages des livres : jamais montrés (aucun visage, aucun personnage) */
const PERSONAS = new Set([
  'youssouf',
  'maryam',
  'fatou',
  'papa',
  'maman',
  'grandpere',
  'grandmere',
  'adam',
  'hadj',
  'aminata',
  'abdullah',
  'imam',
]);

/**
 * Unités dont le conseil d'écriture du livre contredit le sens des traits validé (20/10/2026 : l02 pour le jīm, le
 * ḥāʾ et le khāʾ ; l04 pour le ṣād et le ḍād ; l07 pour le kāf seul et le lām-alif) : le conseil n'est pas montré dans
 * la scène « J'écris » tant que le livre n'est pas corrigé (correction par le processus des livres).
 */
export const CONSEIL_MASQUE: ReadonlySet<string> = new Set(['ad1.l02', 'ad1.l04', 'ad1.l07']);

/** clé courte d'un texte pour les gardes (8 premiers chiffres hexadécimaux de sa clé audio) */
export const gardeVideoKey = (s: string) => (audioFileId(s) ?? '').slice(0, 8);
const GARDE_VID = new Set(VIDEO_GARDE.split(' ').filter(Boolean));
const RECIT_VID = new Set(VIDEO_RECITATION.split(' ').filter(Boolean));

/** Ordre des morceaux d'un exercice « ordre » qui redonne la phrase du livre (espaces ignorés) ; null sinon. */
export function ordreDe(mots: readonly string[], phrase: string): number[] | null {
  const cible = unmark(phrase).replace(/\s+/g, '');
  const parts = mots.map((m) => unmark(m).replace(/\s+/g, ''));
  const pris = new Array<boolean>(parts.length).fill(false);
  const out: number[] = [];
  const go = (pos: number): boolean => {
    if (pos === cible.length) return out.length === parts.length;
    for (let i = 0; i < parts.length; i++) {
      if (pris[i] || !parts[i] || !cible.startsWith(parts[i]!, pos)) continue;
      pris[i] = true;
      out.push(i);
      if (go(pos + parts[i]!.length)) return true;
      pris[i] = false;
      out.pop();
    }
    return false;
  };
  return parts.length > 1 && go(0) ? out : null;
}

/** Mot d'exemple d'une lettre (règle de la charte vidéo) : 1er mot qui la met en évidence en initiale, sinon le 1er qui la met en évidence. */
export function motExemple(l: string, mots: ReadonlyArray<{ ar?: unknown }>): number {
  let parout = -1;
  for (let i = 0; i < mots.length; i++) {
    const ar = str(mots[i]?.ar);
    if (!ar) continue;
    for (const m of ar.matchAll(/\[([^\]]+)\]/g))
      if (m[1]!.startsWith(l) && !LETTER.test(m[1]![l.length] ?? '')) {
        if (m.index === 0) return i;
        if (parout < 0) parout = i;
      }
  }
  return parout;
}

export function buildVideo(lessonRaw: unknown, opts: VideoOptions): VideoLecon {
  const L = obj(lessonRaw);
  const hasAudio = opts.hasAudio ?? (() => false);
  const garde = opts.garde ?? GARDE_VID;
  const recit = opts.recitation ?? RECIT_VID;
  const images = opts.images ? new Set(opts.images) : null;
  const type: VideoLecon['type'] =
    L.type === 'bilan' ? 'bilan' : L.type === 'examen' ? 'examen' : 'lecon';
  const revue = type !== 'lecon';
  const signalements: Signalement[] = [];
  const sansSon = new Map<string, VideoPart>();
  /** partie en cours de génération (audit des audios manquants) */
  let ici: VideoPart = 'ouverture';

  const permis = (s: string) =>
    !!opts.autorises?.includes(audioFileId(s) ?? '') && !lettresDetachees(s);

  // —— versets de la partie Coran de la leçon (jamais affichés ici, jamais dits ailleurs)
  const textes = (x: unknown) =>
    allStr(x)
      .filter((s) => ARABIC.test(s))
      .map((s) => unmark(s).trim());
  // textes arabes des versets (une explication en français qui cite une formule n'est pas un verset). Décision du
  // référent du 20/10 : un hadith ou une phrase d'adab n'est pas du Coran (voix permise) ; restent muets les versets de
  // la partie Coran, les suites de 4 mots du Coran et les citations référencées
  const sacresCoran = [
    ...textes(obj(L.coran).versets).filter((s) => !/[A-Za-z]/.test(s)),
    ...textes(L.coran).filter((s) => looksQuranic(s) && !/[A-Za-z]/.test(s)),
  ];
  // comme les leçons vivantes : un mot isolé (« puis », « ne… pas ») n'est pas une citation ; deux mots ou plus le sont
  const dans = (liste: string[], s: string) => {
    const u = unmark(s).trim();
    const n = nWords(u);
    return (
      n >= 2 &&
      liste.some((t) => t === u || (n >= 3 && t.includes(u)) || (nWords(t) >= 3 && u.includes(t)))
    );
  };
  /** présenté comme Coran par sa forme : graphie du Muṣḥaf, crochets ornés */
  const coranique = (s: string) => looksQuranic(s) || ORNE.test(s);
  // —— sourates et versets que la LEÇON présente comme récitation (lecture : verset entier, graphie du Muṣḥaf) : leurs
  // morceaux ne sont jamais enchaînés en voix de synthèse (on reconstituerait le verset)
  const R = obj(L.lecture);
  const lectureStr = [
    ...arr(R.syllabes).map((s) => obj(s).ar),
    ...arr(R.ligne),
    obj(R.vedette).ar,
    ...arr(R.phrases).map((p) => (typeof p === 'string' ? p : obj(p).ar)),
    ...arr(R.paragraphes).map((p) => (typeof p === 'string' ? p : obj(p).ar)),
  ].filter((s): s is string => !!str(s));
  // une formule marquée « dhikr » par les données n'est pas un passage coranique de la leçon
  const dhikrs = new Set<string>();
  const marque = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(marque);
    else if (x && typeof x === 'object') {
      const o = x as Obj;
      if (o.dhikr === true) allStr(o).forEach((s) => dhikrs.add(s));
      Object.values(o).forEach(marque);
    }
  };
  marque(R);
  const passages = lectureStr
    .filter((s) => !dhikrs.has(s) && ((coranique(s) && !permis(s)) || recit.has(gardeVideoKey(s))))
    .map((s) => ` ${motsDe(s)} `)
    .filter((p) => p.trim());
  const contexte = (s: string) => {
    const m = motsDe(s);
    return !!m && passages.some((p) => p.includes(` ${m} `));
  };

  /** raison de garder un texte sans voix (null : la voix est permise) */
  const raison = (s: string, holder: Obj | null, ctx: boolean): Signalement['raison'] | null => {
    // présenté comme Coran (graphie du Muṣḥaf, référence de verset sur le bloc) : jamais, même une formule de dhikr
    const autorise = permis(s);
    if ((coranique(s) && !autorise) || VERSET.test(String(holder?.ref ?? holder?.ref_fr ?? '')))
      return 'coran';
    // formule de dhikr marquée par les données (`dhikr: true`) : la garde de Tanzil et de la Basmala ne s'applique pas
    const dhikr = holder?.dhikr === true;
    // 4 mots consécutifs du Coran ou plus, hors formules de la liste blanche (liste tenue contre Tanzil)
    if (!dhikr && !autorise && garde.has(gardeVideoKey(s))) return 'coran';
    if (!dhikr && skeleton(s).includes(BASMALA)) return 'basmala';
    // texte des parties Coran (même une formule) ; des parties fiqh/adab (hadith…), hors formules de la liste
    if (dans(sacresCoran, s)) return 'sacre';
    if (ctx && contexte(s)) return 'contexte';
    return null;
  };
  /** texte arabe du livre : affiché sans crochets ; voix seulement si permise ET fichier existant */
  const t = (s: string, holder: Obj | null = null, ctx = true): T => {
    const r = raison(s, holder, ctx);
    if (r) {
      if (!signalements.some((x) => x.texte === s)) signalements.push({ texte: s, raison: r });
      return { ar: unmark(s) };
    }
    if (hasAudio(s)) return { ar: unmark(s), son: 1 };
    // « zéro muet » : un texte sans lettre ni chiffre (« · », « … », « = », « ← », « (...) ») n'a rien à dire : il n'est pas
    // un texte « à écouter » (jamais listé comme sans fichier audio)
    if (!/[\p{L}\p{N}]/u.test(s)) return { ar: unmark(s) };
    if (!sansSon.has(s)) sansSon.set(s, ici);
    return { ar: unmark(s) };
  };
  /** texte arabe du livre seulement affiché (titres, repères, morceaux d'explication : le livre ne les fait pas écouter) */
  /**
   * Règle du client (20/10/2026) : tout texte arabe affiché qui a un fichier audio est dit au moins une fois dans sa
   * scène. Une bulle aux lignes « | » est aussi cherchée d'un trait (lignes jointes par une espace).
   */
  const parle = (s: string, holder: Obj | null = null): T => {
    const x = t(s, holder);
    if (x.son || !s.includes('|')) return x;
    const joint = s.replace(/\s*\|\s*/g, ' ');
    return t(joint, holder).son ? { ar: x.ar, son: 1, dit: joint } : x;
  };

  const banned = new Set(PERSONAS);
  for (const k of arr(obj(L.scene).persos)) if (typeof k === 'string') banned.add(k);
  const dlg = obj(L.dialogue);
  const repliques = arr(dlg.repliques).map(obj);
  for (const r of repliques)
    if (str(r.qui))
      banned.add(
        String(r.qui)
          .toLowerCase()
          .replace(/[^a-z]/g, ''),
      );
  const img = (k: unknown) => {
    const s = str(k);
    return s && !banned.has(s) && (!images || images.has(s)) ? s : undefined;
  };
  /** traduction du livre, sauf leçon ou bloc « sans traduction » */
  const sansTrad = !!R.sans_traduction || type === 'examen';

  const scenes: Scene[] = [];
  const add = (s: Scene) => {
    if (s.temps.length) scenes.push(s);
  };
  const numero =
    typeof L.num_lecon === 'number'
      ? L.num_lecon
      : typeof L.num_bilan === 'number'
        ? L.num_bilan
        : undefined;

  // 1. OUVERTURE : titre du livre, lettres du tableau, bulle de la scène (aucun personnage dessiné)
  const S = obj(L.scene);
  {
    const temps: Temps[] = [];
    // tableau des lettres de la scène, sauf s'il répète le titre arabe (leçon 1 : les mêmes cinq lettres)
    const t0 = (str(S.tableau) ?? '').split(' ').filter(Boolean);
    const titreAr = unmark(str(L.titre_ar) ?? '').replace(/\s+/g, '');
    const tableau = t0.join('') === titreAr ? [] : t0;
    // lettres du titre ou du tableau : leur nom (livre, `lettres`), dit l'un après l'autre
    const lt = arr(L.lettres).map(obj);
    const noms = (tableau.length ? tableau : unmark(str(L.titre_ar) ?? '').split(/\s+/))
      .map((l) => lt.find((x) => x.l === l && str(x.nom_ar)))
      .filter((x): x is Obj => !!x)
      .map((x) => t(x.nom_ar as string, x));
    temps.push({
      k: 'titre',
      ms: MS.titre + tableau.length * MS.tableauItem,
      ...(str(L.titre_fr) ? { fr: L.titre_fr as string } : {}),
      ...(str(L.titre_ar) ? { ar: t(L.titre_ar as string, L) } : {}),
      ...(tableau.length ? { tableau: tableau.map((x) => t(x, S)) } : {}),
      ...(noms.length ? { noms } : {}),
    });
    const lignes = (str(S.bulle_ar) ?? '').split('|').filter((x) => x.trim());
    if (lignes.length) {
      const ls = lignes.map((x) => t(x.trim(), S));
      const tout = parle(S.bulle_ar as string, S);
      temps.push({
        k: 'bulle',
        ms: MS.bulleLigne * lignes.length + (str(S.bulle_fr) ? MS.fr : 0),
        lignes: ls,
        ...(!ls.every((x) => x.son) && tout.son ? { dit: tout } : {}),
        ...(str(S.bulle_fr) && !sansTrad ? { fr: S.bulle_fr as string } : {}),
      });
    }
    add({
      id: 'ouverture',
      part: 'ouverture',
      titre: { cle: type === 'lecon' ? 'vv.lecon' : `vv.${type}`, n: numero },
      modes: ['longue', 'courte', 'revision'],
      temps,
    });
  }

  // 2. OBJECTIFS du livre
  const objectifs = arr(L.objectifs).map(obj);
  add({
    id: 'objectifs',
    part: 'objectifs',
    titre: { cle: 'vv.objectifs' },
    modes: ['longue'],
    temps: objectifs
      .filter((o) => str(o.ar) || str(o.fr))
      .map((o): Temps => ({
        k: 'objectif',
        ms: MS.objectif,
        ...(str(o.ar) ? { ar: t(o.ar as string, o) } : {}),
        ...(str(o.fr) ? { fr: o.fr as string } : {}),
      })),
  });

  // 3. LETTRES : une scène par lettre nouvelle (tracé, nom, repère, formes, syllabes, mot d'exemple, « À toi ! »)
  const lettres = arr(L.lettres).map(obj);
  const mots = arr(L.mots).map(obj);
  const syllabes = arr(R.syllabes)
    .map((s) => str(obj(s).ar))
    .filter((s): s is string => !!s);
  const nouvelles = lettres.filter((x) => str(x.l) && str(x.nom_ar));
  const lettresIdx: VideoLecon['lettres'] = [];
  ici = 'lettres';
  nouvelles.forEach((x, i) => {
    const l = x.l as string;
    const temps: Temps[] = [
      { k: 'trace', l, ms: MS.trace },
      { k: 'nom', nom: t(x.nom_ar as string, x), consigne: { cle: 'vv.ecoute_nom' }, ms: MS.nom },
    ];
    if (str(x.points_ar) || str(x.points_fr))
      temps.push({
        k: 'points',
        ms: MS.points,
        ...(str(x.points_ar) ? { ar: t(x.points_ar as string, x) } : {}),
        ...(str(x.points_fr) ? { fr: x.points_fr as string } : {}),
      });
    const formes = strs(x.formes);
    if (formes.length) temps.push({ k: 'formes', formes, ms: MS.formes });
    // syllabes du livre qui commencent par la lettre (lettre + voyelle)
    const syl = syllabes.filter((s) => s.startsWith(l) && !LETTER.test(s[l.length] ?? ''));
    if (syl.length)
      temps.push({
        k: 'rangee',
        items: syl.map((s) => t(s)),
        consigne: { cle: 'vv.ecoute_lis' },
        ms: MS.rangeeItem * syl.length + 800,
      });
    const ex = motExemple(l, mots);
    const mot = ex >= 0 ? mots[ex]! : null;
    if (mot)
      temps.push({
        k: 'mot',
        ar: t(mot.ar as string, mot),
        ms: MS.mot,
        ...(str(mot.fr) ? { fr: mot.fr as string } : {}),
        ...(img(mot.img) ? { img: img(mot.img) } : {}),
      });
    const puis = [t(x.nom_ar as string, x), ...(mot ? [t(mot.ar as string, mot)] : [])];
    const aToi = (cle: string): Temps => ({
      k: 'aToi',
      consigne: { cle },
      puis,
      ms: MS.aToi + MS.aToiPuis * puis.length,
    });
    temps.push(aToi(mot ? 'vv.dis_nom_mot' : 'vv.dis_nom'), aToi('vv.encore'));
    // 30 s à 1 min : une lettre courte (sans syllabe ni mot du livre) garde des pauses plus longues
    const total = temps.reduce((s, x) => s + x.ms, 0);
    if (total < LETTRE_MIN_MS) {
      const f = LETTRE_MIN_MS / total;
      for (const x of temps) x.ms = Math.ceil(x.ms * f);
    }
    lettresIdx.push({ scene: scenes.length, l });
    add({
      id: `lettre-${i + 1}`,
      part: 'lettres',
      titre: { cle: 'vv.lettre', n: i + 1, total: nouvelles.length },
      modes: ['longue', 'lettre'],
      temps,
      lettre: i,
    });
  });
  // lettres revues (bilans : la lettre seule) : rappel
  const revues = lettres.filter((x) => str(x.l) && !str(x.nom_ar));
  if (revues.length)
    add({
      id: 'rappel-lettres',
      part: 'rappel',
      titre: { cle: 'vv.rappel_lettres' },
      modes: ['longue', 'revision'],
      temps: [
        {
          k: 'lettres',
          items: revues.map((x) => ({ l: x.l as string })),
          ms: 1500 + 700 * revues.length,
        },
        { k: 'aToi', consigne: { cle: 'vv.dis_lettres' }, ms: MS.aToi + 2000 },
      ],
    });

  // 4. ÉCRITURE (cahier) : conseil du livre, lettres liées en mots
  const E = obj(L.ecriture);
  ici = 'ecriture';
  {
    const temps: Temps[] = [];
    // conseil du livre masqué là où il contredit les tracés validés (décision du référent, 20/10/2026), tant que le
    // livre n'est pas corrigé
    if (str(E.conseil_fr) && !CONSEIL_MASQUE.has(opts.unitId))
      temps.push({ k: 'fr', fr: E.conseil_fr as string, ms: MS.fr + 2500 });
    for (const li of arr(E.lier).map(obj)) {
      const ls = strs(li.lettres);
      if (!ls.length || !str(li.mot)) continue;
      temps.push({
        k: 'joindre',
        morceaux: ls.map((x) => ({ ar: x })),
        mot: t(li.mot as string, li),
        ms: MS.joindre + MS.joindreItem * ls.length,
      });
    }
    if (temps.some((x) => x.k === 'joindre'))
      add({
        id: 'ecriture',
        part: 'ecriture',
        titre: { cle: 'vv.ecriture' },
        modes: ['longue'],
        temps,
      });
  }

  // 5. NOTION (je découvre) : titre, signe, morceaux arabes, explication du livre phrase par phrase
  const N = obj(L.notion);
  if (str(N.titre_fr) || str(N.texte_ar) || str(N.signe)) {
    const pieces = (str(N.texte_ar) ?? '')
      .split(SEP)
      .map((x) => x.trim())
      .filter(Boolean);
    const fr = str(N.texte_fr) ? phrasesFr(N.texte_fr as string) : [];
    const temps: Temps[] = [];
    if (str(L.decouvre_fr) || str(L.decouvre_ar))
      temps.push({
        k: 'titre',
        ms: MS.titre,
        ...(str(L.decouvre_fr) ? { fr: L.decouvre_fr as string } : {}),
        ...(str(L.decouvre_ar) ? { ar: t(L.decouvre_ar as string, L) } : {}),
      });
    temps.push({
      k: 'regle',
      ms: 2500 + 1600 * pieces.length + fr.reduce((s, x) => s + 1200 + 45 * x.length, 0),
      ...(str(N.titre_ar) ? { titre_ar: t(N.titre_ar as string, N) } : {}),
      ...(str(N.titre_fr) ? { titre_fr: N.titre_fr as string } : {}),
      ...(str(N.signe) ? { signe: N.signe as string } : {}),
      ...(pieces.length ? { ar: pieces.map((x) => t(x, N)) } : {}),
      ...(fr.length ? { fr } : {}),
    });
    add({
      id: 'notion',
      part: 'notion',
      titre: str(N.titre_fr) ? { fr: N.titre_fr as string } : { cle: 'vv.notion' },
      modes: ['longue'],
      temps,
    });
  }

  // 6. LECTURE : syllabes (écoute), ligne (« À toi ! » puis correction), mot vedette, phrases
  ici = 'lecture';
  /**
   * ligne d'une liste du livre : affichée entière ; dite entière si son fichier audio existe, sinon morceau par
   * morceau (coupée aux séparateurs du livre) quand les morceaux en ont un
   */
  const ligne = (s: string, holder: Obj | null, fr?: string): Ligne => {
    const ar = t(s, holder);
    const morceaux = ar.son
      ? []
      : s
          .split(DECOUPE)
          .map((x) => x.trim())
          .filter((x) => ARABIC.test(x) && !LATIN.test(x));
    const dits = morceaux.length > 1 ? morceaux.map((x) => t(x, holder)).filter((x) => x.son) : [];
    return { ar, ...(dits.length ? { dits } : {}), ...(fr ? { fr } : {}) };
  };
  /** note explicative du livre (vedette, dialogue) : phrase par phrase, comme une règle (jamais de texte coupé) */
  const note = (fr: string): Temps => {
    const ps = phrasesFr(fr);
    return { k: 'regle', fr: ps, ms: 2500 + ps.reduce((n, x) => n + 1200 + 40 * x.length, 0) };
  };
  /** liste de lignes du livre en scènes de quatre lignes au plus */
  const liste = (xs: Obj[]): Temps[] =>
    groupes(xs, 4).map((g): Temps => ({
      k: 'cles',
      items: g.map((x) =>
        ligne(x.ar as string, x, !sansTrad && str(x.fr) ? (x.fr as string) : undefined),
      ),
      ms: 1500 + 2600 * g.length,
    }));
  const syl = arr(R.syllabes)
    .map(obj)
    .filter((x) => str(x.ar));
  // livres de la phrase (Adultes 2…) : la « syllabe » du livre est un mot ou une expression clé de la leçon
  if (syl.length && motsCles(syllabes))
    add({
      id: 'motscles',
      part: 'lecture',
      titre: { cle: 'vv.motscles' },
      modes: ['longue'],
      temps: liste(syl),
    });
  else if (syllabes.length)
    add({
      id: 'syllabes',
      part: 'lecture',
      titre: { cle: 'vv.syllabes' },
      modes: ['longue'],
      temps: groupes(syllabes, 3).map((g): Temps => ({
        k: 'rangee',
        items: g.map((s) => t(s)),
        consigne: { cle: 'vv.ecoute_lis' },
        ms: MS.rangeeItem * g.length + 600,
      })),
    });
  const lignes = strs(R.ligne);
  if (lignes.length) {
    // ligne de syllabes (balisées une à une) : une rangée par ligne du livre ; lignes d'un mot : quatre par rangée
    const parLigne = lignes.map(decouper);
    const rangees = parLigne.every((p) => p.length > 1) ? parLigne : groupes(parLigne.flat(), 4);
    add({
      id: 'ligne',
      part: 'lecture',
      titre: { cle: 'vv.ligne' },
      modes: revue ? ['longue', 'revision'] : ['longue'],
      // « À toi ! » : l'élève lit d'abord, puis l'audio corrige
      temps: rangees.map((g): Temps => ({
        k: 'rangee',
        items: g.map((s) => t(s)),
        consigne: { cle: 'vv.lis_ligne' },
        aToi: 2500 + 900 * g.length,
        ms: MS.rangeeItem * g.length + 2500 + 900 * g.length,
      })),
    });
  }
  const V = obj(R.vedette);
  /** phrase vedette (deux mots ou plus) : écoute, traduction, « À toi de répéter » (aussi au début de la courte) */
  let vedettePhrase: Temps[] | null = null;
  if (str(V.ar)) {
    const ar = V.ar as string;
    const m = balises(ar);
    const fr = !sansTrad && str(V.fr) ? (V.fr as string) : undefined;
    const joint = m.length >= 2 && m.join('') === unmark(ar);
    const phrase = !joint && nWords(unmark(ar)) >= 2;
    const temps: Temps[] = joint
      ? [
          {
            k: 'joindre',
            morceaux: m.map((x) => t(x)),
            mot: t(ar, V),
            ms: MS.joindre + MS.joindreItem * m.length,
            ...(fr ? { fr } : {}),
          },
        ]
      : [
          {
            k: 'texte',
            ar: t(ar, V),
            taille: phrase ? 'm' : 'g',
            ms: 5000,
            ...(fr ? { fr } : {}),
          },
        ];
    temps.push({
      k: 'aToi',
      // sans voix (fichier absent, garde) : l'élève lit la phrase, il n'y a rien à écouter
      consigne: { cle: phrase ? (t(ar, V).son ? 'vv.repete' : 'vv.lis_phrase') : 'vv.lis_mot' },
      puis: [t(ar, V)],
      ms: MS.aToi + 1800,
    });
    if (phrase) vedettePhrase = temps.map((x) => ({ ...x }));
    // explication du livre (sous la vedette)
    if (str(V.note_fr)) temps.push(note(V.note_fr as string));
    add({
      id: 'vedette',
      part: 'lecture',
      titre: { cle: phrase ? 'vv.vedette_phrase' : 'vv.vedette' },
      modes: ['longue'],
      temps,
    });
  }
  const phrases = [...arr(R.phrases), ...arr(R.paragraphes)].map((p) =>
    typeof p === 'string' ? { ar: p } : obj(p),
  );
  {
    const temps: Temps[] = [];
    for (const p of phrases) {
      const ar = str(p.ar);
      if (!ar) continue;
      const fr = !sansTrad && str(p.fr) ? (p.fr as string) : undefined;
      const segAr = ar.split(SEP);
      const segFr = fr?.split(SEP) ?? [];
      if (segAr.length > 1 && segFr.length === segAr.length)
        temps.push({
          k: 'inter',
          ar: segAr.map((x) => t(x.trim(), p)),
          fr: segFr.map((x) => x.trim()),
          ms: 1500 + 1100 * segAr.length,
        });
      else if (segAr.length > 1)
        temps.push({
          k: 'texte',
          ar: t(ar, p),
          taille: 'p',
          ms: Math.min(9000, 2200 + 450 * nWords(unmark(ar))),
          ...(fr ? { fr } : {}),
        });
      else
        temps.push({
          k: 'texte',
          ar: t(ar, p),
          taille: nWords(ar) > 14 ? 'p' : 'm',
          ms: Math.min(12_000, 2200 + 450 * nWords(ar)),
          ...(fr ? { fr } : {}),
        });
    }
    if (temps.length) {
      temps.push({ k: 'aToi', consigne: { cle: 'vv.relis' }, ms: MS.aToi + 1500 });
      add({
        id: 'phrases',
        part: 'lecture',
        titre: { cle: 'vv.phrases' },
        modes: revue ? ['longue', 'revision'] : ['longue'],
        temps,
      });
    }
  }

  // 7. MOTS : chaque mot (image existante, son, sens), puis la grille « touche un mot »
  const motsOk = mots.filter((w) => str(w.ar));
  ici = 'mots';
  if (motsOk.length) {
    const temps: Temps[] = [];
    if (str(L.mots_fr)) temps.push({ k: 'fr', fr: L.mots_fr as string, ms: MS.fr });
    for (const w of motsOk)
      temps.push({
        k: 'mot',
        ar: t(w.ar as string, w),
        ms: MS.mot,
        ...(str(w.fr) ? { fr: w.fr as string } : {}),
        ...(img(w.img) ? { img: img(w.img) } : {}),
      });
    temps.push({
      k: 'grille',
      items: motsOk.map((w) => ({
        ar: t(w.ar as string, w),
        ...(img(w.img) ? { img: img(w.img) } : {}),
      })),
      ms: MS.grille,
    });
    temps.push({ k: 'aToi', consigne: { cle: 'vv.nomme' }, ms: MS.aToi + 2500 });
    add({
      id: 'mots',
      part: 'mots',
      titre: { cle: 'vv.mots' },
      modes: revue ? ['longue', 'revision'] : ['longue'],
      temps,
    });
  }
  // lexique du livre (mots en plus, avec leur sens)
  const lexique = arr(L.lexique)
    .map(obj)
    .filter((x) => str(x.ar));
  if (lexique.length)
    add({
      id: 'lexique',
      part: 'mots',
      titre: { cle: 'vv.lexique' },
      modes: revue ? ['longue', 'revision'] : ['longue'],
      temps: liste(lexique),
    });

  // 8. EXERCICES du livre (livre de lecture, puis cahier), dans l'ordre du livre
  const exos = arr(L.exercices).map(obj);
  const tous = new Set(allStr(lessonRaw).map(unmark));
  ici = 'quiz';
  for (const ex of [
    ...exos.filter((e) => e.livre !== 'ecriture'),
    ...exos.filter((e) => e.livre === 'ecriture'),
  ]) {
    const qs = questions(ex, t, img, tous);
    if (!qs.length) continue;
    const jouable = qs.every(estJouable);
    const titreFr = str(ex.titre_fr);
    const revision = revue || /^r[ée]vision/i.test(titreFr ?? '');
    add({
      id: `q-${str(ex.id)?.split('.').pop() ?? scenes.length}`,
      part: 'quiz',
      titre: titreFr ? { fr: titreFr } : { cle: 'vv.quiz' },
      modes: [
        'longue',
        ...(jouable ? (['quiz'] as const) : []),
        ...(revision ? (['revision'] as const) : []),
      ],
      temps: qs.map((q, i) => ({ k: 'q', q, i, n: qs.length, ms: MS.question })),
      ...(jouable ? { jouable: true as const } : {}),
    });
  }

  // 9. DIALOGUE : bulles (aucun personnage), puis la ligne-modèle du livre
  ici = 'dialogue';
  if (repliques.length) {
    const cotes: Record<string, 0 | 1> = {};
    let n = 0;
    const temps: Temps[] = [];
    for (const r of repliques) {
      const ar = str(r.ar);
      if (!ar) continue;
      const qui = str(r.qui) ?? '';
      if (!(qui in cotes)) cotes[qui] = (n++ % 2) as 0 | 1;
      temps.push({
        k: 'bulle',
        lignes: [t(ar, r, false)],
        cote: cotes[qui]!,
        ms: MS.bulle + 40 * ar.length,
        ...(str(r.qui_ar) ? { qui: r.qui_ar as string } : {}),
        ...(str(r.fr) ? { fr: r.fr as string } : {}),
      });
    }
    for (const p of (str(dlg.note_ar) ?? '').split(SEP).filter((x) => x.trim()))
      temps.push({ k: 'texte', ar: t(p.trim(), dlg), taille: 'p', ms: 3500 });
    // explication du livre sous le dialogue
    if (str(dlg.note_fr)) temps.push(note(dlg.note_fr as string));
    add({
      id: 'dialogue',
      part: 'dialogue',
      titre: str(dlg.titre_fr) ? { fr: dlg.titre_fr as string } : { cle: 'vv.dialogue' },
      modes: ['longue'],
      temps,
    });
  }

  // 10. JE RETIENS (récapitulatif et score du quiz) ; sans « je retiens » dans le livre, les lettres de la leçon et
  // leur repère (comme les leçons vivantes)
  // unité sans lettre nouvelle (livres de la phrase) : « À retenir » de grammaire, la règle puis son exemple arabe
  ici = 'recap';
  const retiens = arr(L.retiens).map(obj);
  const grammaire = !nouvelles.length && retiens.some((r) => str(r.fr));
  add({
    id: 'recap',
    part: 'recap',
    titre: { cle: grammaire ? 'vv.retenir' : 'vv.recap' },
    modes: ['longue'],
    temps: grammaire
      ? retiens
          .filter((r) => str(r.ar) || str(r.fr))
          .map((r): Temps => ({
            k: 'retenir',
            ms: 3000 + (str(r.fr) ? 35 * (r.fr as string).length : 0),
            ...(str(r.fr) ? { fr: r.fr as string } : {}),
            ...(str(r.ar) ? { ar: t(r.ar as string, r) } : {}),
          }))
      : retiens.length
        ? retiens
            .filter((r) => str(r.ar) || str(r.fr))
            .map((r): Temps => ({
              k: 'regle',
              ms: 2600 + (str(r.fr) ? 30 * (r.fr as string).length : 0),
              ...(str(r.ar) ? { ar: [t(r.ar as string, r)] } : {}),
              ...(str(r.fr) ? { fr: [r.fr as string] } : {}),
            }))
        : nouvelles.map((x): Temps => ({
            k: 'regle',
            ms: 2600 + (str(x.points_fr) ? 30 * (x.points_fr as string).length : 0),
            signe: x.l as string,
            ar: [
              t(x.nom_ar as string, x),
              ...(str(x.points_ar) ? [t(x.points_ar as string, x)] : []),
            ],
            ...(str(x.points_fr) ? { fr: [x.points_fr as string] } : {}),
          })),
  });

  // 11. « À toi de jouer la scène ! » : l'élève choisit un rôle, l'appli joue les autres (audio du livre)
  const jouables = repliques.filter((r) => str(r.ar) && str(r.qui) && str(r.qui_ar));
  if (new Set(jouables.map((r) => r.qui)).size >= 2)
    add({
      id: 'jouer',
      part: 'jouer',
      titre: { cle: 'vv.jouer' },
      modes: ['longue'],
      temps: [
        {
          k: 'jouer',
          ms: 0,
          repliques: jouables.map((r) => ({
            qui: r.qui as string,
            qui_ar: r.qui_ar as string,
            ar: t(r.ar as string, r, false),
            ...(str(r.fr) ? { fr: r.fr as string } : {}),
          })),
        },
      ],
    });

  // 12. VERSION COURTE (1 à 2 min) : les lettres (nom), puis les mots ; à défaut, le mot vedette et les phrases ; livres
  // de la phrase : la phrase vedette, les mots, puis le dialogue
  ici = 'resume';
  courte(scenes, nouvelles, motsOk, t, img, vedettePhrase, opts.v2);
  // 13. RÉVISION d'une leçon (décision du 20/10/2026) : « Je retiens » et ce que le livre y reprend des leçons
  // précédentes (texte du livre qui renvoie à une leçon antérieure, ou « rappel »)
  if (!revue)
    for (const s of scenes) if (s.id === 'recap' || reprend(s, numero)) s.modes.push('revision');
  // l'ouverture n'entre dans la révision que si le livre y reprend quelque chose
  if (!scenes.some((s) => s.id !== 'ouverture' && s.modes.includes('revision')))
    for (const s of scenes) s.modes = s.modes.filter((m) => m !== 'revision');

  if (opts.v2) {
    // 14. V2 — « Retenir » toujours en dernier : « Je retiens » passe après « À toi de jouer la scène ! »
    const ir = scenes.findIndex((s) => s.id === 'recap');
    if (ir >= 0 && scenes.slice(ir + 1).some((s) => s.part === 'jouer'))
      scenes.push(...scenes.splice(ir, 1));
    // 15. V2 — récapitulatif final de la version courte : ce qu'elle a montré (lettres, vedette, mots), MÊMES objets T
    // (voix et garde déjà décidées) : rien de nouveau n'est affiché ni dit
    const lettresVues: T[] = [];
    const motsVus: Array<{ ar: T; img?: string }> = [];
    let vedetteVue: T | undefined;
    for (const s of scenes.filter((x) => x.modes.includes('courte')))
      for (const x of s.temps) {
        if (x.k === 'lettres') for (const i of x.items) lettresVues.push(t(i.l));
        if (x.k === 'mot') motsVus.push({ ar: x.ar, ...(x.img ? { img: x.img } : {}) });
        if ((s.id === 'vedette' || s.id === 'courte-vedette') && !vedetteVue)
          if (x.k === 'texte') vedetteVue = x.ar;
          else if (x.k === 'joindre') vedetteVue = x.mot;
      }
    if (lettresVues.length || motsVus.length || vedetteVue)
      scenes.push({
        id: 'recap-courte',
        part: 'recap',
        titre: { cle: 'vv.vu' },
        modes: ['courte'],
        temps: [
          {
            k: 'bilan',
            lettres: lettresVues,
            ...(vedetteVue ? { vedette: vedetteVue } : {}),
            mots: motsVus,
            ms: 2500,
          },
        ],
      });
    for (const s of scenes) s.chapitre = chapitreDe(s);
  }

  // voix de secours de chaque scène (textes arabes affichés, garde appliquée, fichier présent), huit au plus
  const SANS_VOIX = new Set([
    'k',
    'ms',
    'fr',
    'titre_fr',
    'oui_fr',
    'non_fr',
    'img',
    'cle',
    'qui',
    'qui_ar',
  ]);
  for (const s of scenes) {
    const vus = new Set<string>();
    const voix: T[] = [];
    const walk = (y: unknown): void => {
      if (typeof y === 'string') {
        if (ARABIC.test(y) && !LATIN.test(y) && !vus.has(y) && voix.length < 8) {
          vus.add(y);
          // jamais un texte que la garde a déjà gardé muet avec son bloc (référence de verset, contexte…)
          const u = unmark(y);
          if (
            !signalements.some((x) => unmark(x.texte) === u) &&
            !raison(y, null, true) &&
            hasAudio(y)
          )
            voix.push({ ar: u, son: 1 });
        }
      } else if (Array.isArray(y)) y.forEach(walk);
      else if (y && typeof y === 'object')
        for (const [k, z] of Object.entries(y)) if (!SANS_VOIX.has(k)) walk(z);
    };
    walk(s.temps);
    if (voix.length) s.voix = voix;
  }
  const modes = VIDEO_MODES.filter((m) => scenes.some((s) => s.modes.includes(m)));
  const source = sha1Hex(
    JSON.stringify(lessonRaw ?? null) + '\n' + [...(opts.audioList ?? [])].sort().join(','),
  );
  return {
    unitId: opts.unitId,
    source,
    type,
    ...(numero !== undefined ? { numero } : {}),
    scenes,
    modes,
    lettres: lettresIdx,
    signalements,
    sansSon: [...sansSon].map(([texte, part]) => ({ texte, part })),
  };
}

/** La scène montre-t-elle un texte du livre qui renvoie à une leçon antérieure (« leçon 5 », « rappel ») ? */
function reprend(s: Scene, numero: number | undefined): boolean {
  const txt = JSON.stringify(s.temps);
  if (/\b[Rr]appel\b/.test(txt)) return true;
  for (const m of txt.matchAll(/le[çc]ons?\s+(\d+)/g))
    if (numero && Number(m[1]) < numero) return true;
  return false;
}

/** phrases d'une explication française du livre (coupées après « . » suivi d'une espace ; jamais réécrites) */
export function phrasesFr(fr: string): string[] {
  const out: string[] = [];
  let reste = fr;
  for (;;) {
    const m = /^(.+?[.!?])\s+(?=[A-ZÀ-Ý0-9«(])/.exec(reste);
    if (!m) break;
    out.push(m[1]!);
    reste = reste.slice(m[0].length);
  }
  if (reste.trim()) out.push(reste);
  return out;
}

/**
 * morceaux d'une ligne de lecture, coupés aux espaces quand ce sont des syllabes (balisées une à une, ou d'une
 * seule lettre chacune) ; sinon la ligne du livre reste entière (mot, groupe de mots)
 */
function decouper(lg: string): string[] {
  const parts = lg.split(/\s+/).filter(Boolean);
  const syllabe = (p: string) =>
    /^\[[^\]]+\]$/.test(p) || unmark(p).replace(NON_LETTRE, '').length === 1;
  return parts.length > 1 && parts.every(syllabe) ? parts : [lg];
}

/**
 * Liste « syllabes » du livre faite de mots ou d'expressions (livres de la phrase : pronoms, démonstratifs, nombres,
 * verbes…) : la moitié au moins de ses entrées comptent trois lettres ou plus (article de tête non compté).
 */
export function motsCles(xs: readonly string[]): boolean {
  const n = (s: string) =>
    unmark(s)
      .replace(new RegExp(`^${ch(0x627, 0x644)}`), '')
      .replace(NON_LETTRE, '').length;
  return xs.length > 0 && xs.filter((s) => n(s) >= 3).length * 2 >= xs.length;
}

/** groupes de n éléments, dans l'ordre */
function groupes<X>(xs: X[], n: number): X[][] {
  return xs.reduce<X[][]>((a, x, i) => (i % n ? a[a.length - 1]!.push(x) : a.push([x]), a), []);
}

function estJouable(q: Question): boolean {
  switch (q.k) {
    case 'ecoute':
      return !!q.dit?.son;
    case 'chasse':
      return true;
    case 'premiere':
      return !!q.reponse;
    case 'contient':
      return q.mots.every((m) => typeof m.oui === 'boolean');
    case 'relier':
      return !q.droite && q.items.length > 1;
    case 'vf':
      return typeof q.vrai === 'boolean';
    case 'ordre':
      return !!q.ordre;
    case 'complete':
      return !!q.reponse;
  }
}

type Tf = (s: string, holder?: Obj | null, ctx?: boolean) => T;

/** Questions d'un exercice du livre (tous les types d'Adultes 1), telles que la projection élève les donne. */
function questions(
  ex: Obj,
  t: Tf,
  img: (k: unknown) => string | undefined,
  tous: ReadonlySet<string>,
): Question[] {
  const items = arr(ex.items).map(obj);
  const fr = (x: Obj) => (str(x.fr) ? { fr: x.fr as string } : {});
  const im = (x: Obj) => (img(x.img) ? { img: img(x.img) } : {});
  switch (ex.type) {
    case 'ecoute':
      return items
        .filter((it) => strs(it.options).length)
        .map((it): Question => {
          const dit =
            str(it.dit) && strs(it.options).includes(it.dit as string)
              ? t(it.dit as string, it)
              : null;
          // sans fichier audio, l'item ne s'écoute pas : affiché tel quel, réponse montrée (non jouable)
          return { k: 'ecoute', options: strs(it.options), ...(dit ? { dit } : {}) };
        });
    case 'chasse':
      return str(ex.cible) && strs(ex.grille).length
        ? [{ k: 'chasse', cible: ex.cible as string, grille: strs(ex.grille) }]
        : [];
    case 'premiere_lettre':
      return items
        .filter((it) => str(it.suite) && strs(it.options).length)
        .map((it): Question => ({
          k: 'premiere',
          suite: it.suite as string,
          options: strs(it.options),
          ...(str(it.reponse) && strs(it.options).includes(it.reponse as string)
            ? { reponse: it.reponse as string, bonne: t(it.reponse as string, it) }
            : {}),
          ...(str(it.mot) ? { mot: t(it.mot as string, it) } : {}),
          ...im(it),
          ...fr(it),
        }));
    case 'contient': {
      const ms = arr(ex.mots)
        .map(obj)
        .filter((m) => str(m.ar));
      return str(ex.cible) && ms.length
        ? [
            {
              k: 'contient',
              cible: ex.cible as string,
              mots: ms.map((m) => ({
                ar: t(m.ar as string, m),
                ...(typeof m.oui === 'boolean' ? { oui: m.oui } : {}),
              })),
              ...(str(ex.oui_fr) ? { oui_fr: ex.oui_fr as string } : {}),
              ...(str(ex.non_fr) ? { non_fr: ex.non_fr as string } : {}),
            },
          ]
        : [];
    }
    case 'relier': {
      // épreuve (bilan) : deux colonnes, la droite décalée par la projection, sans corrigé
      const g = arr(ex.gauche).map(obj);
      if (g.length)
        return [
          {
            k: 'relier',
            items: g.filter((x) => str(x.ar)).map((x) => ({ ar: t(x.ar as string, x) })),
            droite: arr(ex.droite)
              .map(obj)
              .map((x) => ({ ...im(x), ...fr(x) })),
          },
        ];
      const its = items.filter((x) => str(x.ar) && (str(x.fr) || img(x.img)));
      return its.length
        ? [
            {
              k: 'relier',
              items: its.map((x) => ({ ar: t(x.ar as string, x), ...im(x), ...fr(x) })),
            },
          ]
        : [];
    }
    case 'vrai_faux':
      return items
        .filter((it) => str(it.ar))
        .map((it): Question => ({
          k: 'vf',
          ar: t(it.ar as string, it),
          ...(typeof it.vrai === 'boolean' ? { vrai: it.vrai } : {}),
          ...(str(it.correction_ar) ? { correction: t(it.correction_ar as string, it) } : {}),
          ...im(it),
          ...fr(it),
        }));
    case 'ordre':
      return items
        .filter((it) => strs(it.mots).length > 1)
        .map((it): Question => {
          const phrase = str(it.phrase);
          const ordre = phrase ? ordreDe(strs(it.mots), phrase) : null;
          return {
            k: 'ordre',
            mots: strs(it.mots),
            ...(phrase ? { phrase: t(phrase, it) } : {}),
            ...(ordre ? { ordre } : {}),
            ...fr(it),
          };
        });
    case 'complete':
      return items
        .filter((it) => strs(it.options).length)
        .map((it): Question => {
          const avant = typeof it.avant === 'string' ? it.avant : '';
          const apres = typeof it.apres === 'string' ? it.apres : '';
          const rep =
            str(it.reponse) && strs(it.options).includes(it.reponse as string)
              ? (it.reponse as string)
              : undefined;
          // le mot entier n'est montré que s'il est écrit TEL QUEL dans la leçon (jamais recomposé ici)
          const entier = rep && ARABIC.test(rep) && (avant || apres) ? avant + rep + apres : '';
          return {
            k: 'complete',
            avant,
            apres,
            options: strs(it.options),
            ...(rep ? { reponse: rep } : {}),
            ...(rep && ARABIC.test(rep) && !LATIN.test(rep) ? { bonne: t(rep, it) } : {}),
            ...(entier && tous.has(entier) ? { mot: t(entier, it) } : {}),
            ...fr(it),
          };
        });
    default:
      return [];
  }
}

/** Version courte : scènes propres au mode « courte » (lettres puis mots ; à défaut lecture), 1 à 2 min. */
function courte(
  scenes: Scene[],
  nouvelles: Obj[],
  mots: Obj[],
  t: Tf,
  img: (k: unknown) => string | undefined,
  vedette: Temps[] | null,
  v2 = false,
): void {
  const ouv = scenes.find((s) => s.id === 'ouverture');
  let total = ouv ? duree(ouv) : 0;
  const ajout: Scene[] = [];
  const fin = { k: 'aToi' as const, consigne: { cle: 'vv.nomme' }, ms: MS.aToi + 1500 };
  // sans lettre nouvelle : la phrase vedette du livre ouvre la version courte (« phrase vedette du jour »)
  if (!nouvelles.length && vedette) {
    ajout.push({
      id: 'courte-vedette',
      part: 'resume',
      titre: { cle: 'vv.vedette_phrase' },
      modes: ['courte'],
      temps: vedette,
    });
    total += vedette.reduce((s, x) => s + x.ms, 0);
  }
  if (nouvelles.length) {
    const temps: Temps[] = [
      {
        k: 'lettres',
        items: nouvelles.map((x) => ({ l: x.l as string, nom: t(x.nom_ar as string, x) })),
        ms: 1500 + 2600 * nouvelles.length,
      },
      { k: 'aToi', consigne: { cle: 'vv.dis_lettres' }, ms: MS.aToi + 1500 },
    ];
    ajout.push({
      id: 'courte-lettres',
      part: 'resume',
      titre: { cle: 'vv.lettres' },
      modes: ['courte'],
      temps,
    });
    total += temps.reduce((s, x) => s + x.ms, 0);
  }
  if (mots.length) {
    const temps: Temps[] = [];
    let ms = fin.ms;
    for (const w of mots) {
      if (total + ms + 3200 > COURTE_MAX_MS) break;
      ms += 3200;
      temps.push({
        k: 'mot',
        ar: t(w.ar as string, w),
        ms: 3200,
        ...(str(w.fr) ? { fr: w.fr as string } : {}),
        ...(img(w.img) ? { img: img(w.img) } : {}),
      });
    }
    if (temps.length) {
      temps.push(fin);
      ajout.push({
        id: 'courte-mots',
        part: 'resume',
        titre: { cle: 'vv.mots' },
        modes: ['courte'],
        temps,
      });
      total += ms;
    }
  }
  // moins d'une minute : le mot vedette et les phrases du livre complètent (dans l'ordre), sans dépasser 2 min ; livres
  // de la phrase : le dialogue d'abord (le cœur oral du niveau)
  if (total < COURTE_MIN_MS)
    for (const id of !nouvelles.length && vedette
      ? ['dialogue', 'phrases', 'ligne']
      : ['vedette', 'phrases', 'ligne']) {
      const s = scenes.find((x) => x.id === id);
      if (!s || total >= COURTE_MIN_MS || total + duree(s) > COURTE_MAX_MS) continue;
      s.modes.push('courte');
      total += duree(s);
    }
  // la version courte n'est proposée que si elle dure au moins une minute
  if (total < COURTE_MIN_MS) {
    for (const s of scenes) s.modes = s.modes.filter((m) => m !== 'courte');
    return;
  }
  // après l'ouverture et avant la lecture ; V2 : ordre du livre, les mots à la place des mots (après la lecture)
  const debut = v2 ? ajout.filter((s) => s.id !== 'courte-mots') : ajout;
  const at = scenes.findIndex((s) => s.part !== 'ouverture' && s.part !== 'objectifs');
  scenes.splice(at < 0 ? scenes.length : at, 0, ...debut);
  if (!v2) return;
  const am = scenes.findIndex((s) =>
    ['mots', 'quiz', 'dialogue', 'recap', 'jouer'].includes(s.part),
  );
  scenes.splice(am < 0 ? scenes.length : am, 0, ...ajout.filter((s) => s.id === 'courte-mots'));
}

/** Durée prévue d'une scène (ms) ; les questions comptent `MS.question` chacune. */
export function duree(s: Scene): number {
  return s.temps.reduce((n, x) => n + x.ms, 0);
}

/** Scènes d'un mode (et, pour « par lettre », de la lettre choisie). */
export function scenesDuMode(v: VideoLecon, mode: VideoMode, lettre = 0): Scene[] {
  return v.scenes.filter(
    (s) => s.modes.includes(mode) && (mode !== 'lettre' || s.lettre === lettre),
  );
}

/** Durée prévue d'un mode (ms). */
export const dureeMode = (v: VideoLecon, mode: VideoMode, lettre = 0) =>
  scenesDuMode(v, mode, lettre).reduce((n, s) => n + duree(s), 0);

/** Toutes les chaînes affichées ou dites d'une vidéo (contrôle de fidélité) : arabe et français séparés. */
export function videoStrings(v: VideoLecon): { ar: string[]; fr: string[]; cles: string[] } {
  const ar: string[] = [];
  const fr: string[] = [];
  const cles: string[] = [];
  const A = (s?: string | T) => {
    if (s === undefined) return;
    ar.push(typeof s === 'string' ? s : s.ar);
    if (typeof s !== 'string' && s.dit) ar.push(s.dit);
  };
  const F = (s?: string) => s !== undefined && fr.push(s);
  const C = (c?: Cle | { fr: string }) => {
    if (!c) return;
    if ('fr' in c) F(c.fr);
    else cles.push(c.cle);
  };
  for (const s of v.scenes) {
    C(s.titre);
    s.voix?.forEach(A);
    for (const x of s.temps) {
      switch (x.k) {
        case 'titre':
          F(x.fr);
          A(x.ar);
          x.tableau?.forEach(A);
          x.noms?.forEach(A);
          break;
        case 'bulle':
          x.lignes.forEach(A);
          A(x.dit);
          F(x.fr);
          A(x.qui);
          break;
        case 'objectif':
          A(x.ar);
          F(x.fr);
          break;
        case 'trace':
          A(x.l);
          break;
        case 'nom':
          A(x.nom);
          C(x.consigne);
          break;
        case 'points':
          A(x.ar);
          F(x.fr);
          break;
        case 'formes':
          x.formes.forEach(A);
          break;
        case 'rangee':
          x.items.forEach(A);
          C(x.consigne);
          break;
        case 'joindre':
          x.morceaux.forEach(A);
          A(x.mot);
          F(x.fr);
          break;
        case 'texte':
          A(x.ar);
          F(x.fr);
          break;
        case 'inter':
          x.ar.forEach(A);
          x.fr.forEach(F);
          break;
        case 'mot':
          A(x.ar);
          F(x.fr);
          break;
        case 'grille':
          x.items.forEach((i) => A(i.ar));
          break;
        case 'regle':
          A(x.titre_ar);
          F(x.titre_fr);
          A(x.signe);
          x.ar?.forEach(A);
          x.fr?.forEach(F);
          break;
        case 'fr':
          F(x.fr);
          break;
        case 'lettres':
          x.items.forEach((i) => (A(i.l), A(i.nom)));
          break;
        case 'aToi':
          C(x.consigne);
          x.puis?.forEach(A);
          break;
        case 'jouer':
          for (const r of x.repliques) {
            A(r.qui_ar);
            A(r.ar);
            F(r.fr);
          }
          break;
        case 'bilan':
          x.lettres.forEach(A);
          A(x.vedette);
          x.mots.forEach((m) => A(m.ar));
          break;
        case 'cles':
          for (const l of x.items) {
            A(l.ar);
            l.dits?.forEach(A);
            F(l.fr);
          }
          break;
        case 'retenir':
          F(x.fr);
          A(x.ar);
          break;
        case 'q': {
          const q = x.q;
          const AF = (s: string) => (ARABIC.test(s) ? A(s) : F(s));
          switch (q.k) {
            case 'ecoute':
              A(q.dit);
              q.options.forEach(A);
              break;
            case 'chasse':
              A(q.cible);
              q.grille.forEach(A);
              break;
            case 'premiere':
              A(q.suite);
              q.options.forEach(A);
              A(q.reponse);
              A(q.mot);
              A(q.bonne);
              F(q.fr);
              break;
            case 'contient':
              A(q.cible);
              q.mots.forEach((m) => A(m.ar));
              F(q.oui_fr);
              F(q.non_fr);
              break;
            case 'relier':
              q.items.forEach((i) => (A(i.ar), F(i.fr)));
              q.droite?.forEach((d) => F(d.fr));
              break;
            case 'vf':
              A(q.ar);
              F(q.fr);
              A(q.correction);
              break;
            case 'ordre':
              q.mots.forEach(AF);
              A(q.phrase);
              F(q.fr);
              break;
            case 'complete':
              if (q.avant) AF(q.avant);
              if (q.apres) AF(q.apres);
              q.options.forEach(AF);
              A(q.mot);
              A(q.bonne);
              F(q.fr);
              break;
          }
          break;
        }
      }
    }
  }
  return { ar: ar.filter((s) => s !== ''), fr, cles };
}

/** Textes dits (voix permise ET fichier présent) d'une vidéo : contrôle de la garde. */
export function videoVoix(v: VideoLecon): string[] {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Obj;
      if (typeof o.ar === 'string' && o.son === 1) out.push(o.ar);
      Object.values(o).forEach(walk);
    }
  };
  walk(v.scenes);
  return out;
}
