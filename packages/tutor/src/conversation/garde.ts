/**
 * GARDES du tuteur de conversation (déterministes, sans modèle) :
 *  - à l'ENTRÉE : question religieuse, détresse, injection… repérées AVANT tout appel au modèle (texte) ou sur la
 *    transcription (voix) ; une question religieuse n'atteint jamais le modèle en mode texte ;
 *  - à la SORTIE : brouillon validé (forme, longueurs), jugement religieux, citation, numéro de recueil, texte
 *    coranique (jamais affiché s'il vient du modèle), phonétique latine, émoji visage, données personnelles ;
 *  - VOIX : la synthèse ne lit JAMAIS un texte qui contient du Coran (trigramme du Tanzil), décision 7 ;
 *  - NIVEAU : part des mots de la réponse absents des mots déjà vus (journalisée pour la batterie de contrôle).
 */
import {
  bareWords,
  hasArabic,
  PRESENTATION_FORMS,
  transliterationPatterns,
  transliterationRuns,
  type QuranIndex,
} from '../arabic.js';
import { classify, fold } from '../classify.js';
import {
  CITATION,
  COLLECTION_NUMBER,
  FACE_EMOJI,
  HUMAN,
  PERSONAL,
  POLEMIC_OUT,
  VERDICT,
  VERDICT_WORDS,
} from '../filter.js';
import type { FilterEvent } from '../types.js';
import { ENCOURAGEMENTS_AR } from './prompt.js';
import type { ConvBrouillon, MotNiveau } from './types.js';

/**
 * Jugements religieux en arabe (forme nue). « واجب » et « فرض » n'y sont PAS : ce sont aussi « devoir (scolaire) » dans
 * les leçons ; le modèle n'a de toute façon pas le droit d'en parler (invite) et le français est contrôlé.
 */
const AVIS_AR = / (ال|و|ف)?(حرام|حلال|مكروه|مستحب|يجوز|محرم|فتوي|فتوى) /;

export type EntreeCategorie =
  'normal' | 'religion' | 'protection' | 'injection' | 'hors_sujet' | 'perso';

/**
 * Questions religieuses dites ou écrites EN ARABE (le classifieur commun couvre le français et l'anglais), cherchées
 * sur la forme NUE (voyelles retirées, ة → ه, ى → ي) : une transcription vocalisée est reconnue aussi.
 */
const RELIGION_AR =
  / (ما|ماذا) حكم | هل يجوز | (ال)?(فتوي|فتاوي|حديث|احاديث|تفسير|حلال|حرام|مكروه|سوره|القران|قران|فقه|الفقه|فتوي) /;
/** Mots de « religion » en français que le classifieur commun ne range pas en avis (questions de fond). */
const RELIGION_FR =
  /\b(tafsir|tafs[iî]r|fiqh|fikh|coran|quran|sourate|verset|ablution|wudu|priere|salat|ramadan|zakat|hajj|invocation|dou?a|prophete|sunna|religion|religieu)/;

export function classerEntree(texte: string): EntreeCategorie {
  const c = classify(texte);
  if (c === 'detresse' || c === 'rencontre') return 'protection';
  if (c === 'injection') return 'injection';
  if (c === 'avis_religieux' || c === 'hadith' || c === 'coran_texte') return 'religion';
  if (c === 'polemique') return 'hors_sujet';
  if (c === 'donnees_perso') return 'perso';
  if (RELIGION_AR.test(` ${bareWords(texte).join(' ')} `) || RELIGION_FR.test(fold(texte)))
    return 'religion';
  return 'normal';
}

const MAX_AR = 400;
const MAX_FR = 600;
const str = (x: unknown, max: number): string | null =>
  typeof x === 'string' && x.length <= max ? x.trim() : null;

/** Brouillon conforme au schéma, ou null (aucun champ en plus, longueurs bornées). */
export function validerBrouillon(x: unknown): ConvBrouillon | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const permis = new Set(['transcription_ar', 'reponse_ar', 'reponse_fr', 'correction', 'sujet']);
  if (Object.keys(o).some((k) => !permis.has(k))) return null;
  const transcription_ar = str(o.transcription_ar ?? '', MAX_AR);
  const reponse_ar = str(o.reponse_ar, MAX_AR);
  const reponse_fr = str(o.reponse_fr, MAX_FR);
  const sujet = o.sujet;
  if (transcription_ar === null || reponse_ar === null || reponse_fr === null) return null;
  if (sujet !== 'langue' && sujet !== 'religion' && sujet !== 'autre') return null;
  let correction: ConvBrouillon['correction'] = null;
  if (o.correction !== null && o.correction !== undefined) {
    const c = o.correction as Record<string, unknown>;
    const dit = str(c.dit, MAX_AR);
    const correct = str(c.correct, MAX_AR);
    const explication_fr = str(c.explication_fr, MAX_FR);
    if (dit === null || correct === null || explication_fr === null) return null;
    correction = { dit, correct, explication_fr };
  }
  return { transcription_ar, reponse_ar, reponse_fr, correction, sujet };
}

export interface ResultatFiltre {
  ok: boolean;
  brouillon: ConvBrouillon | null;
  /** la transcription contient du Coran (l'élève a récité) : renvoi vers « Réciter et vérifier » */
  coranEleve: boolean;
  events: FilterEvent[];
}

/** Le texte contient-il du Coran (trigramme du Tanzil, forme nue) ? */
export const contientCoran = (texte: string, index: QuranIndex): boolean =>
  !!texte && index.matches(texte).length > 0;

/** Filtre de sortie : tout manquement → la réponse du modèle n'est PAS montrée (repli de l'application). */
export function filtrerSortie(raw: unknown, index: QuranIndex): ResultatFiltre {
  const events: FilterEvent[] = [];
  const b = validerBrouillon(raw);
  if (!b)
    return {
      ok: false,
      brouillon: null,
      coranEleve: false,
      events: [{ step: 'schema', action: 'bloque' }],
    };
  const coranEleve = contientCoran(b.transcription_ar, index);
  const bloque = (step: string, detail?: string) =>
    events.push({ step, action: 'bloque', ...(detail ? { detail } : {}) });
  const fr = [b.reponse_fr, b.correction?.explication_fr ?? ''].join('\n');
  const frPlie = fold(fr);
  const ar = [b.reponse_ar, b.correction?.correct ?? ''].join('\n');
  if (contientCoran(ar, index)) bloque('coran');
  if (PRESENTATION_FORMS.test(ar + fr)) bloque('formes_presentation');
  // l'arabe est comparé en forme NUE (voyelles retirées) : « حَرَامٌ » est reconnu comme « حرام »
  const arNu = ` ${bareWords(ar).join(' ')} `;
  if (VERDICT.test(frPlie) || VERDICT_WORDS.test(fr) || AVIS_AR.test(arNu)) bloque('avis');
  if (CITATION.test(frPlie) || CITATION.test(arNu) || COLLECTION_NUMBER.test(fr))
    bloque('citation');
  if (POLEMIC_OUT.test(frPlie)) bloque('polemique');
  if (PERSONAL.test(frPlie)) bloque('donnees_perso');
  if (HUMAN.test(frPlie)) bloque('humain');
  if (new RegExp(FACE_EMOJI.source, 'u').test(fr + ar)) bloque('emoji');
  if (transliterationRuns(fr).length || transliterationPatterns(fr).length) bloque('phonetique');
  // l'arabe de la réponse est écrit en arabe : aucune lettre latine dedans
  if (/[A-Za-z]{2,}/.test(b.reponse_ar)) bloque('latin_dans_arabe');
  if (!hasArabic(b.reponse_ar) && b.sujet === 'langue') bloque('reponse_sans_arabe');
  if (!events.length) events.push({ step: 'sortie', action: 'ok' });
  return { ok: !events.some((e) => e.action === 'bloque'), brouillon: b, coranEleve, events };
}

/** La voix peut-elle lire ce texte ? Jamais de Coran (décision 7), jamais de lettres latines. */
export function voixPermise(texteAr: string, index: QuranIndex): boolean {
  return (
    !!texteAr && hasArabic(texteAr) && !contientCoran(texteAr, index) && !/[A-Za-z]/.test(texteAr)
  );
}

// ------------------------------------------------------------------ niveau (fidélité au programme)

/** Petits mots outils permis à tous les niveaux à partir du 2 (formes nues). */
const OUTILS = new Set(
  bareWords(
    'هو هي هم هن انا انت انتم نحن هذا هذه ذلك تلك هؤلاء الذي التي في من الى على عن مع ب ل ك و ف ثم او لا نعم ما ماذا من اين متى كيف كم هل لماذا اي عند يا ليس',
  ),
);
const PREFIXES = /^(وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك|س)/;
const SUFFIXES = /(هما|كما|كم|كن|هم|هن|نا|ها|ه|ك|ي|ات|ون|ين|ان|ه|ت|وا|ا)$/;

function racines(w: string): string[] {
  const out = new Set<string>([w]);
  const sansPre = w.replace(PREFIXES, '');
  out.add(sansPre);
  for (const x of [w, sansPre]) {
    const s = x.replace(SUFFIXES, '');
    if (s.length >= 2) out.add(s);
  }
  return [...out].filter((x) => x.length >= 2);
}

/** Ensemble de formes nues des mots du niveau (avec et sans article, sans tanwīn ni ة finale). */
export function formesNiveau(mots: readonly MotNiveau[]): Set<string> {
  const s = new Set<string>(OUTILS);
  for (const m of [...mots, ...ENCOURAGEMENTS_AR.map((ar) => ({ ar }))])
    for (const w of bareWords(m.ar)) for (const r of racines(w)) s.add(r);
  return s;
}

/** Mots de la réponse que rien ne rattache aux mots déjà vus (contrôle de niveau, journalisé). */
export function motsHorsNiveau(texteAr: string, formes: ReadonlySet<string>): string[] {
  const hors: string[] = [];
  for (const w of bareWords(texteAr)) {
    if (w.length < 2 || OUTILS.has(w)) continue;
    if (!racines(w).some((r) => formes.has(r))) hors.push(w);
  }
  return hors;
}
