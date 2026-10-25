/**
 * Garde coranique de la VOIX (décisions du référent du 20/10/2026) : UNE seule règle, partagée par les vidéos vivantes
 * (calcul de `video-garde.ts`, `test/video.test.ts`) et l'import des audios des leçons (`packages/db/src/lecons-audio.ts`).
 *
 *  - CITATION : jamais de voix à partir de `CITATION_MOTS` (4) mots consécutifs du Coran (texte Tanzil, versets
 *    enchaînés), SAUF :
 *     - quand ces mots sont tous dans une formule de dhikr de la liste blanche (`dhikr.ts`, données
 *       `data/dhikr-formules.json`) : une formule seule, ou une phrase qui la contient sans citer le Coran au-delà ;
 *     - pour un HADITH ou un ATHAR identifié comme tel (mention « رواه », parole du Prophète ﷺ citée entre
 *       guillemets, ou champ du livre : degré, source, partie « hadiths », source citée ; empreintes
 *       `HADITH_CITANTS`, calculées sur les livres) : un hadith n'est pas du Coran, même s'il en reprend une
 *       expression ; jamais quand le texte annonce un verset (« تعالى », « قرأ », « سورة »…), porte une référence
 *       de verset ou récite un verset ENTIER de trois mots ou plus (`contientVerset`) ;
 *    en dessous de 4 mots (mot isolé, exemple de grammaire), la voix est permise ;
 *  - comparaison des mots : squelette sans voyelles ni alif (l'écriture du Muṣḥaf et l'écriture courante d'un même
 *    passage se rejoignent), PUIS contrôle des alifs : un alif écrit dans le texte là où le mot du Coran n'a ni alif
 *    ni alif suscrit ni hamza (قالت / قُلْتَ, فقال / فَقُلِ) n'est pas le même mot ;
 *  - TEXTES AUTORISÉS (« zéro muet », décisions du référent du 24/10/2026) : un texte de la liste
 *    `data/zero-muet/garde-autorises.json` (vocabulaire de moins de 4 mots, définitions, vers didactiques, textes du
 *    livre) est lu par la synthèse même si l'une des règles ci-dessous le refuserait (`autorise`, `refusVoix`) ;
 *  - PRÉSENTÉ COMME CORAN, quelle que soit la longueur et même pour une formule de la liste : graphie du Muṣḥaf,
 *    citation référencée dans le texte (« … (49:10) » : texte de deux mots ou plus lu dans le Coran ; parenthèses
 *    ornées ﴿…﴾ toujours), verset(s) entier(s) de deux mots ou plus (récitation, dont la Basmala seule : 1:1),
 *    Basmala complète en contexte de récitation (« قرأ », sourate, Fātiḥa, Coran : `basmalaRecitee`),
 *    et les textes que les livres présentent comme Coran (partie Coran, citation référencée, lecture d'un verset :
 *    empreintes `VIDEO_GARDE` et `VIDEO_RECITATION`, calculées sur les livres par le test « garde vidéo à jour »).
 */
import { audioFileId, looksQuranic, quranCorpus, skeleton } from './audio-cle.js';
import { motsDhikr } from './dhikr.js';
import { HADITH_CITANTS } from './hadith-garde.js';
import { GARDE_AUTORISES } from './garde-autorises.js';
import { VIDEO_GARDE, VIDEO_RECITATION } from './video-garde.js';

/** nombre de mots consécutifs du Coran qui font une citation */
export const CITATION_MOTS = 4;
/** versets consécutifs au plus comparés pour un texte de récitation */
const VERSETS_MAX = 8;

export interface GardeCoran {
  /**
   * suites de `CITATION_MOTS` mots du Coran (squelettes joints par une espace, versets enchaînés) → motifs d'alif de
   * chaque occurrence (`motifs`, mots joints par une espace)
   */
  suites: ReadonlyMap<string, readonly string[]>;
  /** squelettes d'un à huit versets consécutifs, de deux mots au moins (sans la Basmala de tête de sourate) */
  versets: ReadonlySet<string>;
  /** squelettes de chaque verset et de chaque paire de versets consécutifs (`quranCorpus`) */
  extraits: string;
}

/** squelette de la Basmala complète (1:1), écrit par codes */
export const BASMALA_COMPLETE = skeleton(
  String.fromCharCode(
    ...[0x628, 0x633, 0x645, 0x20, 0x627, 0x644, 0x644, 0x647, 0x20, 0x627, 0x644, 0x631],
    ...[0x62d, 0x645, 0x646, 0x20, 0x627, 0x644, 0x631, 0x62d, 0x64a, 0x645],
  ),
);

// classes écrites par codes (une fonction : la règle no-misleading-character-class ne les évalue pas)
const c = (n: number) => String.fromCharCode(n);
/**
 * alif et ce qui en tient lieu : ا أ إ آ ٱ, hamza seule, alif suscrit, hamza et madda combinantes (l'écriture du
 * Muṣḥaf note souvent le ā par l'alif suscrit, et la hamza sur une ligne d'allongement)
 */
const ALIF = new Set([0x627, 0x623, 0x625, 0x622, 0x671, 0x621, 0x670, 0x654, 0x655, 0x653].map(c));

type Classe = { k: 'alif' } | { k: 'signe' } | { k: 'separateur' } | { k: 'lettre'; l: string };
const classes = new Map<string, Classe>();
/** classe d'un caractère, déduite de `skeleton` (même découpage en mots, mêmes lettres) */
function classe(ch: string): Classe {
  let r = classes.get(ch);
  if (r) return r;
  const b = c(0x628);
  const k = skeleton(`${b}${ch}${b}`);
  if (ALIF.has(ch)) r = { k: 'alif' };
  else if (k === `${b}${b}`) r = { k: 'signe' };
  else if (k === `${b} ${b}`) r = { k: 'separateur' };
  else r = { k: 'lettre', l: k.slice(1, -1) };
  classes.set(ch, r);
  return r;
}

/** Mot d'un texte : squelette (comme `skeleton`) et motif d'alif (un chiffre par intervalle entre les lettres). */
export interface MotSquelette {
  k: string;
  /** « 1 » : un alif (ou ce qui en tient lieu) est écrit avant la lettre de même rang (dernier chiffre : après la dernière) */
  m: string;
}

/** Mots d'un texte, découpés exactement comme `skeleton(s).split(' ')`, avec leur motif d'alif. */
export function motsSquelette(s: string): MotSquelette[] {
  const out: MotSquelette[] = [];
  let k = '';
  let m = '0';
  const fin = () => {
    if (k) out.push({ k, m });
    k = '';
    m = '0';
  };
  for (const ch of String(s ?? '')) {
    const x = classe(ch);
    if (x.k === 'alif') m = `${m.slice(0, -1)}1`;
    else if (x.k === 'separateur') fin();
    else if (x.k === 'lettre') {
      k += x.l;
      m += '0';
    }
  }
  fin();
  return out;
}

/** le mot du texte peut-il être ce mot du Coran ? (pas d'alif écrit là où le Coran n'en a aucun) */
const memeAlif = (texte: string, coran: string) => {
  for (let i = 0; i < texte.length; i++) if (texte[i] === '1' && coran[i] !== '1') return false;
  return true;
};

/** Données de la garde à partir du texte des versets (Tanzil, ORDRE DU MUṢḤAF). */
export function gardeCoran(verses: ReadonlyArray<string>): GardeCoran {
  if (verses.length === 0) throw new Error('texte du Coran absent : garde coranique impossible');
  const versets = new Set<string>();
  // le texte Tanzil met la Basmala en tête du premier verset des sourates : un verset entier se compare sans elle
  const sk = verses
    .map(skeleton)
    .map((x) => (x.startsWith(`${BASMALA_COMPLETE} `) ? x.slice(BASMALA_COMPLETE.length + 1) : x));
  for (let i = 0; i < sk.length; i++)
    for (let j = i, acc = ''; j < Math.min(sk.length, i + VERSETS_MAX); j++) {
      acc = acc ? `${acc} ${sk[j]}` : sk[j]!;
      if (acc.includes(' ')) versets.add(acc);
    }
  const w = verses.flatMap(motsSquelette);
  const suites = new Map<string, string[]>();
  for (let i = 0; i + CITATION_MOTS <= w.length; i++) {
    const win = w.slice(i, i + CITATION_MOTS);
    const cle = win.map((x) => x.k).join(' ');
    const motif = win.map((x) => x.m).join(' ');
    const l = suites.get(cle);
    if (!l) suites.set(cle, [motif]);
    else if (!l.includes(motif)) l.push(motif);
  }
  return { suites, versets, extraits: quranCorpus(verses) };
}

/** crochets de balisage des livres */
const sansCrochets = (s: string) => s.replace(/[[\]]/g, '');

/**
 * Suite de 4 mots consécutifs du Coran ou plus, hors formule de dhikr (les 4 mots d'une formule de la liste ne
 * comptent pas), comparée mot à mot (squelette, puis alifs).
 */
export function citeCoran(s: string, g: GardeCoran): boolean {
  const t = sansCrochets(s);
  const w = motsDhikr(t).flatMap((x) =>
    motsSquelette(t.slice(x.a, x.b)).map((y) => ({ ...y, f: x.f })),
  );
  for (let i = 0; i + CITATION_MOTS <= w.length; i++) {
    const win = w.slice(i, i + CITATION_MOTS);
    if (win.every((x) => x.f)) continue;
    const occ = g.suites.get(win.map((x) => x.k).join(' '));
    if (!occ) continue;
    for (const o of occ) {
      const ms = o.split(' ');
      if (win.every((x, j) => memeAlif(x.m, ms[j]!))) return true;
    }
  }
  return false;
}

/** Texte de récitation : graphie du Muṣḥaf, ou un ou plusieurs versets entiers (deux mots ou plus). */
export const recitationCoran = (s: string, g: GardeCoran): boolean =>
  looksQuranic(s) || g.versets.has(skeleton(sansCrochets(s)));

/** référence de verset écrite dans le texte (« 49:10 », « ٣٠:٢١ », « 2:255-257 ») */
const REFERENCE = /[0-9٠-٩]{1,3}\s*:\s*[0-9٠-٩]{1,3}/;
/** parenthèses ornées du Muṣḥaf */
const ORNEES = /[﴾﴿]/;

/**
 * Citation référencée (même règle que les vidéos : texte relié à une référence de verset et lu dans le Coran) : le
 * texte porte une référence de verset et ses mots arabes, deux au moins, se lisent dans un verset ou deux versets
 * consécutifs ; un paragraphe qui CITE une référence sans recopier le verset n'en est pas une.
 */
function citationReferencee(s: string, g: GardeCoran): boolean {
  if (ORNEES.test(s)) return true;
  if (!REFERENCE.test(s)) return false;
  const k = skeleton(sansCrochets(s));
  return k.includes(' ') && g.extraits.includes(` ${k} `);
}

/** clé courte d'un texte pour les gardes des livres (8 premiers chiffres hexadécimaux de sa clé audio) */
export const gardeCle = (s: string): string => (audioFileId(s) ?? '').slice(0, 8);

let livres: Set<string> | null = null;
/** Texte que les livres présentent comme Coran (partie Coran, citation référencée, lecture d'un verset). */
const presenteParLesLivres = (s: string): boolean =>
  (livres ??= new Set(`${VIDEO_GARDE} ${VIDEO_RECITATION}`.split(' ').filter(Boolean))).has(
    gardeCle(s),
  );

/** texte comparé sans voyelles ni signes (lettres et ponctuation gardées) */
const nu = (s: string) => skeleton(s.replace(/[«»]/g, ' « '));
/** « رواه » (رَوَاهُ, رواها…) : mention de la source d'un hadith */
const RAWAHU = new RegExp(`(^| )${c(0x648)}?${c(0x631)}${c(0x648)}${c(0x647)}${c(0x645)}?( |$)`);
/** parole du Prophète ﷺ citée : ﷺ puis, de près, un guillemet ouvrant */
const PROPHETE = /ﷺ[^«»]{0,24}«/;
/**
 * mots qui annoncent un verset (« تعالى », « قرأ », « تلا », « سورة », « آية » : squelettes تعلي, قر, تل, سوره, يه ;
 * « فقرأ » n'est pas compté : son squelette est celui de « فقر »)
 * — un hadith qui cite le Coran garde la garde
 */
const ANNONCE_VERSET = new RegExp(
  `(^| )(${[
    [0x62a, 0x639, 0x644, 0x64a],
    [0x648, 0x62a, 0x639, 0x644, 0x64a],
    [0x642, 0x631],
    [0x648, 0x642, 0x631],
    [0x62a, 0x644],
    [0x641, 0x62a, 0x644],
    [0x633, 0x648, 0x631, 0x647],
    [0x64a, 0x647],
  ]
    .map((x) => String.fromCharCode(...x))
    .join('|')})( |$)`,
);
/** « الفاتحة », « القرآن » : squelettes لفتحه, لقرن (contexte de récitation de la Basmala) */
const RECITATION = new RegExp(
  `(^| )(${[
    [0x644, 0x641, 0x62a, 0x62d, 0x647],
    [0x644, 0x642, 0x631, 0x646],
  ]
    .map((x) => String.fromCharCode(...x))
    .join('|')})( |$)`,
);

/**
 * Basmala complète en contexte coranique (récitée, annoncée avec une sourate, la Fātiḥa, le Coran) : elle reste du
 * Coran ; dite avant d'agir (début de lettre, d'un livre, d'un acte), c'est une formule de la liste blanche.
 */
export function basmalaRecitee(s: string): boolean {
  const k = nu(sansCrochets(s));
  return (
    ` ${k} `.includes(` ${BASMALA_COMPLETE} `) && (ANNONCE_VERSET.test(k) || RECITATION.test(k))
  );
}

let hadiths: Set<string> | null = null;

/**
 * Hadith ou athar identifié (décision du référent du 20/10/2026) : mention « رواه », parole du Prophète ﷺ citée,
 * ou texte que les livres donnent comme hadith (empreintes `HADITH_CITANTS`) ; jamais s'il annonce un verset.
 */
export function estHadith(s: string): boolean {
  const k = nu(s);
  // un texte qui annonce un verset ou porte une référence de verset n'est jamais exempté
  if (ANNONCE_VERSET.test(k) || REFERENCE.test(s) || ORNEES.test(s)) return false;
  if (RAWAHU.test(k) || PROPHETE.test(s)) return true;
  return (hadiths ??= new Set(HADITH_CITANTS.split(' ').filter(Boolean))).has(gardeCle(s));
}

/** clé d'un texte de la liste des textes autorisés (12 premiers chiffres hexadécimaux de sa clé audio) */
export const autoriseCle = (s: string): string => (audioFileId(s) ?? '').slice(0, 12);
let autorises: Set<string> | null = null;
/** Texte que le référent a décidé « lu par la synthèse » (`data/zero-muet/garde-autorises.json`). */
export const autorise = (s: string): boolean =>
  (autorises ??= new Set(GARDE_AUTORISES.split(' ').filter(Boolean))).has(autoriseCle(s));

/**
 * Raison de refuser la voix à un texte (null : voix permise).
 *  - « coran » : présenté comme Coran (jamais de voix, même pour une formule de la liste ou un hadith) ;
 *  - « citation » : 4 mots consécutifs du Coran ou plus, hors formule de dhikr, dans un texte qui n'est pas un hadith.
 */
export function refusVoix(s: string, g: GardeCoran): 'coran' | 'citation' | null {
  if (autorise(s)) return null;
  if (recitationCoran(s, g) || citationReferencee(s, g) || presenteParLesLivres(s)) return 'coran';
  if (basmalaRecitee(s)) return 'coran';
  if (citationInterdite(s, g)) return 'citation';
  return null;
}

/** Citation du Coran sans voix : 4 mots consécutifs ou plus hors formule de dhikr, dans un texte qui n'est pas un hadith. */
export const citationInterdite = (s: string, g: GardeCoran): boolean =>
  citeCoran(s, g) && (!estHadith(s) || contientVerset(s, g));

/** versets les plus longs (en mots) cherchés dans un texte */
const VERSET_MOTS_MAX = 130;

/**
 * Le texte contient-il un verset ENTIER (trois mots ou plus, squelette) ? Un hadith qui récite un verset entier
 * (« قُلْ هُوَ اللَّهُ أَحَدٌ… », « الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ») n'est pas exempté : on n'entendrait que le verset.
 */
export function contientVerset(s: string, g: GardeCoran): boolean {
  const w = skeleton(sansCrochets(s)).split(' ').filter(Boolean);
  for (let i = 0; i < w.length; i++)
    for (let n = 3; n <= Math.min(VERSET_MOTS_MAX, w.length - i); n++)
      if (g.versets.has(w.slice(i, i + n).join(' '))) return true;
  return false;
}
