/**
 * Garde coranique de la VOIX (décisions du référent du 20/10/2026) : UNE seule règle, partagée par les vidéos vivantes
 * (calcul de `video-garde.ts`, `test/video.test.ts`) et l'import des audios des leçons (`packages/db/src/lecons-audio.ts`).
 *
 *  - CITATION : jamais de voix à partir de `CITATION_MOTS` (4) mots consécutifs du Coran (texte Tanzil sans voyelles,
 *    versets enchaînés), SAUF quand ces mots sont tous dans une formule de dhikr de la liste blanche (`dhikr.ts`,
 *    données `data/dhikr-formules.json`) : une formule seule, ou une phrase qui la contient sans citer le Coran
 *    au-delà, est sonorisée ; en dessous de 4 mots (mot isolé, exemple de grammaire), la voix est permise ;
 *  - PRÉSENTÉ COMME CORAN, quelle que soit la longueur et même pour une formule de la liste : graphie du Muṣḥaf,
 *    citation référencée dans le texte (« … (49:10) » : texte de deux mots ou plus lu dans le Coran ; parenthèses
 *    ornées ﴿…﴾ toujours), verset(s) entier(s) de deux mots ou plus (récitation),
 *    et les textes que les livres présentent comme Coran (partie Coran, citation référencée, lecture d'un verset :
 *    empreintes `VIDEO_GARDE` et `VIDEO_RECITATION`, calculées sur les livres par le test « garde vidéo à jour »).
 */
import { audioFileId, looksQuranic, quranCorpus, quranRuns, skeleton } from './audio-cle.js';
import { motsDhikr } from './dhikr.js';
import { VIDEO_GARDE, VIDEO_RECITATION } from './video-garde.js';

/** nombre de mots consécutifs du Coran qui font une citation */
export const CITATION_MOTS = 4;
/** versets consécutifs au plus comparés pour un texte de récitation */
const VERSETS_MAX = 8;

export interface GardeCoran {
  /** suites de `CITATION_MOTS` mots du Coran (squelettes, versets enchaînés) */
  suites: ReadonlySet<string>;
  /** squelettes d'un à huit versets consécutifs, de deux mots au moins (sans la Basmala de tête de sourate) */
  versets: ReadonlySet<string>;
  /** squelettes de chaque verset et de chaque paire de versets consécutifs (quranCorpus) */
  extraits: string;
}

/** squelette de la Basmala complète (1:1), écrit par codes */
export const BASMALA_COMPLETE = skeleton(
  String.fromCharCode(
    ...[0x628, 0x633, 0x645, 0x20, 0x627, 0x644, 0x644, 0x647, 0x20, 0x627, 0x644, 0x631],
    ...[0x62d, 0x645, 0x646, 0x20, 0x627, 0x644, 0x631, 0x62d, 0x64a, 0x645],
  ),
);

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
  return { suites: quranRuns(verses, CITATION_MOTS), versets, extraits: quranCorpus(verses) };
}

/** crochets de balisage des livres */
const sansCrochets = (s: string) => s.replace(/[[\]]/g, '');

/**
 * Citation du Coran : 4 mots consécutifs du Coran ou plus, sauf si ces 4 mots sont tous dans une formule de dhikr
 * de la liste blanche.
 */
export function citeCoran(s: string, g: GardeCoran): boolean {
  const t = sansCrochets(s);
  const w = motsDhikr(t).flatMap((m) =>
    skeleton(t.slice(m.a, m.b))
      .split(' ')
      .filter(Boolean)
      .map((k) => ({ k, f: m.f })),
  );
  for (let i = 0; i + CITATION_MOTS <= w.length; i++) {
    const win = w.slice(i, i + CITATION_MOTS);
    if (!win.every((x) => x.f) && g.suites.has(win.map((x) => x.k).join(' '))) return true;
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

/**
 * Raison de refuser la voix à un texte (null : voix permise).
 *  - « coran » : présenté comme Coran (jamais de voix, même pour une formule de la liste) ;
 *  - « citation » : 4 mots consécutifs du Coran ou plus, hors formule de dhikr.
 */
export function refusVoix(s: string, g: GardeCoran): 'coran' | 'citation' | null {
  if (recitationCoran(s, g) || citationReferencee(s, g) || presenteParLesLivres(s)) return 'coran';
  if (citeCoran(s, g)) return 'citation';
  return null;
}
