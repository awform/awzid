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
import type { Audience, FilterEvent } from '../types.js';
import { ENCOURAGEMENTS_AR } from './prompt.js';
import { sujetSensible, sujetSensibleSortie, type SujetSensible } from './sujets.js';
import type { ConvBrouillon, ConvSortieFournisseur, MotNiveau, Replique } from './types.js';

/**
 * Jugements religieux en arabe (forme nue). « واجب » et « فرض » n'y sont PAS : ce sont aussi « devoir (scolaire) » dans
 * les leçons ; le modèle n'a de toute façon pas le droit d'en parler (invite) et le français est contrôlé.
 */
const AVIS_AR = / (ال|و|ف)?(حرام|حلال|مكروه|مستحب|يجوز|محرم|فتوي|فتوى) /;

export type EntreeCategorie =
  'normal' | 'religion' | 'protection' | 'injection' | 'hors_sujet' | 'perso' | SujetSensible;

/**
 * Questions religieuses dites ou écrites EN ARABE (le classifieur commun couvre le français et l'anglais), cherchées
 * sur la forme NUE (voyelles retirées, ة → ه, ى → ي) : une transcription vocalisée est reconnue aussi.
 */
const RELIGION_AR =
  / (ما|ماذا) حكم | هل يجوز | (ال)?(فتوي|فتاوي|حديث|احاديث|تفسير|حلال|حرام|مكروه|سوره|القران|قران|فقه|الفقه|فتوي) /;
/** Mots de « religion » en français que le classifieur commun ne range pas en avis (questions de fond). */
const RELIGION_FR =
  /\b(tafsir|tafs[iî]r|fiqh|fikh|coran|quran|sourate|verset|ablution|wudu|priere|salat|ramadan|zakat|hajj|invocation|dou?a|prophete|sunna|religion|religieu)/;

/**
 * Marques religieuses SANS ambiguïté : elles l'emportent sur un sujet sensible (« l'alcool est-il haram ? » →
 * religion). Les tournures d'avis plus vagues du classifieur commun (« est-ce que je peux », « interdit »,
 * « obligatoire »…) cèdent devant un sujet sensible repéré (« est-ce que je peux investir en bourse ? » → conseil).
 */
const RELIGION_FORTE =
  /\b(haram|halal|fatwa|islam|musulman|religi|allah|dieu|prophete|imam|mosquee|madhh?ab|makrou?h|mustahab|wajib)/;

/**
 * Catégorie de ce que l'élève a écrit ou dit, AVANT tout appel au modèle. `audience` : les ados ont une règle plus
 * stricte pour les contenus inconvenants (sujets.ts).
 */
export function classerEntree(texte: string, audience: Audience = 'adulte'): EntreeCategorie {
  // l'arabe est classé AUSSI en forme nue : « أُرِيدُ أَنْ أَمُوتَ » ou « حَدِيثًا », vocalisés, ne passent plus
  const cs = [classify(texte)];
  if (hasArabic(texte)) cs.push(classify(bareWords(texte).join(' ')));
  const a = (x: string) => cs.includes(x as (typeof cs)[number]);
  if (a('detresse') || a('rencontre')) return 'protection';
  if (a('injection')) return 'injection';
  if (a('hadith') || a('coran_texte')) return 'religion';
  const c = a('avis_religieux') ? 'avis_religieux' : cs[0]!;
  const plie = fold(texte);
  const religionAr = RELIGION_AR.test(` ${bareWords(texte).join(' ')} `);
  const sensible = sujetSensible(texte, audience);
  if (c === 'avis_religieux')
    return sensible && !RELIGION_FORTE.test(plie) && !religionAr ? sensible : 'religion';
  if (c === 'polemique') return sensible ?? 'hors_sujet';
  if (religionAr || RELIGION_FR.test(plie)) return 'religion';
  if (sensible) return sensible;
  if (c === 'donnees_perso') return 'perso';
  return 'normal';
}

/**
 * Motif d'une catégorie « protection » : RENCONTRE (un inconnu, souvent d'internet, veut voir l'élève ou obtenir ses
 * coordonnées) ou DÉTRESSE (violence subie, idées noires). Il choisit le message (rencontre : « n'y va jamais
 * seul(e) ») et le motif de l'alerte. La détresse l'emporte (appel à l'aide jamais manqué).
 */
export function motifProtection(texte: string): 'rencontre' | 'detresse' {
  const cs = [classify(texte)];
  if (hasArabic(texte)) cs.push(classify(bareWords(texte).join(' ')));
  return cs.includes('rencontre') && !cs.includes('detresse') ? 'rencontre' : 'detresse';
}

/** Catégories qui, repérées sur ce que l'élève a dit (voix), remplacent la réponse par un renvoi. */
export const RENVOIS_ENTREE: readonly EntreeCategorie[] = [
  'protection',
  'injection',
  'perso',
  'hors_sujet',
  'politique',
  'inconvenant',
  'conseil',
];

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
  // 20/10/2026 : politique et actualité, contenus inconvenants, conseils médicaux, juridiques ou financiers
  const sensible = sujetSensibleSortie(fr, ar);
  if (sensible) bloque('sujet_sensible', sensible);
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

// ------------------------------------------------------------------ issue d'un tour (API et batterie de contrôle)

export type Renvoi = EntreeCategorie | 'coran';

export interface IssueTour {
  route: 'conversation' | 'conversation_repli';
  /** renvoi à afficher à la place d'une réponse (religion, Coran, protection, sujet sensible…), ou null */
  redir: Renvoi | null;
  /** réponse montrée à l'élève (celle du modèle si elle a tout passé ; sinon, repli : réplique du livre) */
  reponse: { ar: string; fr: string } | null;
  correction: ConvBrouillon['correction'];
  transcription: string;
  /** sujet déclaré par le modèle (null : pas de brouillon valide) */
  sujet: ConvBrouillon['sujet'] | null;
  filtre: FilterEvent[];
  repli: boolean;
  /**
   * repli dû à une PANNE (erreur de l'API, réponse vide ou JSON illisible, hors schéma), et non à un garde-fou :
   * l'élève voit la réplique du livre, mais rien n'a été jugé (20/10/2026 : à distinguer dans la batterie)
   */
  repliTechnique: boolean;
  /** mots de la réponse hors des mots déjà vus (contrôle de niveau) */
  horsNiveau: string[];
  /** nombre de mots de la réponse comptés pour le contrôle de niveau */
  motsReponse: number;
}

/**
 * Ce que l'application fait de la sortie du modèle — UNE seule règle, partagée par l'API (POST …/libre) et par la
 * batterie de contrôle (cli/batterie-conversation) : ce que la batterie note est exactement ce que l'élève verrait.
 */
export function issueDuTour(
  out: Pick<ConvSortieFournisseur, 'status' | 'brouillon' | 'detail'>,
  o: {
    index: QuranIndex;
    audio: boolean;
    audience: Audience;
    mots: readonly MotNiveau[];
    dialogue: readonly Replique[];
  },
): IssueTour {
  const r: IssueTour = {
    route: 'conversation',
    redir: null,
    reponse: null,
    correction: null,
    transcription: '',
    sujet: null,
    filtre: [],
    repli: false,
    repliTechnique: false,
    horsNiveau: [],
    motsReponse: 0,
  };
  if (out.status !== 'ok') {
    // « refus » : la sécurité du fournisseur a bloqué (garde-fou) ; « erreur » : PANNE, rien n'a été jugé (20/10/2026 :
    // la batterie réelle notait « fournisseur:bloque:api_400 », lu à tort comme un blocage)
    r.repliTechnique = out.status === 'erreur';
    r.filtre = [
      {
        step: r.repliTechnique ? 'panne_fournisseur' : 'fournisseur',
        action: 'bloque',
        detail: out.detail ?? out.status,
      },
    ];
    r.route = 'conversation_repli';
  } else {
    const f = filtrerSortie(out.brouillon, o.index);
    r.filtre = f.events;
    const br = f.brouillon;
    // brouillon hors schéma (champ manquant, en trop, trop long) : réponse illisible, donc panne
    if (!br) r.repliTechnique = true;
    r.sujet = br?.sujet ?? null;
    const dit = br?.transcription_ar ?? '';
    const cat = br && o.audio ? classerEntree(dit, o.audience) : 'normal';
    const sensibleModele: SujetSensible | null =
      br && br.sujet === 'autre' ? sujetSensibleSortie(br.reponse_fr, br.reponse_ar) : null;
    if (br && (f.coranEleve || contientCoran(dit, o.index))) r.redir = 'coran';
    else if (br && (br.sujet === 'religion' || cat === 'religion')) r.redir = 'religion';
    else if (br && RENVOIS_ENTREE.includes(cat)) r.redir = cat;
    // le modèle a refusé un sujet sensible (« sujet » = autre, réponse qui le nomme) : renvoi poli de l'application
    else if (sensibleModele) r.redir = sensibleModele;
    else if (f.ok && br) {
      r.reponse = { ar: br.reponse_ar, fr: br.reponse_fr };
      r.correction = br.correction;
      r.transcription = br.transcription_ar;
      r.horsNiveau = motsHorsNiveau(br.reponse_ar, formesNiveau(o.mots));
      r.motsReponse = bareWords(br.reponse_ar).filter(
        (w) => w.length >= 2 && !OUTILS.has(w),
      ).length;
      r.filtre.push({ step: 'niveau', action: 'ok', detail: `${r.horsNiveau.length} hors liste` });
    } else r.route = 'conversation_repli';
    if (r.redir) r.transcription = dit;
  }
  // repli sûr : une réplique du DIALOGUE DU LIVRE (jamais un texte inventé)
  if (r.route === 'conversation_repli') {
    r.repli = true;
    const d = o.dialogue[0];
    r.reponse = d ? { ar: d.ar, fr: d.fr ?? '' } : null;
  }
  return r;
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
