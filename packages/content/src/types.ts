/**
 * Modèle typé du contenu AWFORM (d'après awform/SCHEMA.md et le moteur awform.js).
 * Les champs non utilisés par le MVP restent ouverts (index signature) : l'import ne perd rien,
 * le contenu complet est conservé tel quel (JSONB).
 * Ce module ne contient que des types et deux listes constantes : il peut être importé par l'appareil sans coût.
 */

/** Texte arabe tel qu'écrit dans les livres, balisage de couleur `[..]` compris. Jamais normalisé. */
export type ArText = string;

export interface Bilingual {
  ar: ArText;
  fr: string;
}

// ---------------------------------------------------------------- exercices « langue » (MVP)

interface ExerciseCommon {
  titre_ar?: ArText;
  titre_fr?: string;
  consigne_fr?: string;
  /** "ecriture" : l'exercice passe dans le cahier d'écriture */
  livre?: 'ecriture' | string;
  [extra: string]: unknown;
}

export interface PremiereLettreItem {
  img?: string;
  suite: ArText;
  reponse: ArText;
  options: ArText[];
  mot?: ArText;
  fr?: string;
  [extra: string]: unknown;
}
export interface PremiereLettreExercise extends ExerciseCommon {
  type: 'premiere_lettre';
  items: PremiereLettreItem[];
}

export interface ChasseExercise extends ExerciseCommon {
  type: 'chasse';
  cible: ArText;
  grille: ArText[];
}

export interface RelierItem {
  ar: ArText;
  img?: string;
  fr?: string;
  [extra: string]: unknown;
}
export interface RelierExercise extends ExerciseCommon {
  type: 'relier';
  items: RelierItem[];
}

export interface EcouteItem {
  options: ArText[];
  /** ce que l'adulte (ou l'audio) prononce */
  dit: ArText;
  /** option à choisir quand elle diffère de `dit` (27/09) */
  reponse?: ArText;
  [extra: string]: unknown;
}
export interface EcouteExercise extends ExerciseCommon {
  type: 'ecoute';
  items: EcouteItem[];
}

export interface VraiFauxItem {
  img?: string;
  ar?: ArText;
  fr?: string;
  vrai: boolean;
  correction_ar?: ArText;
  [extra: string]: unknown;
}
export interface VraiFauxExercise extends ExerciseCommon {
  type: 'vrai_faux';
  items: VraiFauxItem[];
}

export interface CompleteItem {
  avant?: ArText;
  apres?: ArText;
  options: ArText[];
  reponse: ArText;
  fr?: string;
  [extra: string]: unknown;
}
export interface CompleteExercise extends ExerciseCommon {
  type: 'complete';
  items: CompleteItem[];
}

export interface ContientMot {
  ar: ArText;
  oui: boolean;
  [extra: string]: unknown;
}
export interface ContientExercise extends ExerciseCommon {
  type: 'contient';
  cible: ArText;
  mots: ContientMot[];
  oui_fr?: string;
  non_fr?: string;
}

export interface OrdreItem {
  mots: ArText[];
  phrase: ArText;
  fr?: string;
  [extra: string]: unknown;
}
export interface OrdreExercise extends ExerciseCommon {
  type: 'ordre';
  items: OrdreItem[];
}

/** Les 8 types « langue » corrigés automatiquement (CDC §2.3.2 A). */
export type LanguageExercise =
  | PremiereLettreExercise
  | ChasseExercise
  | RelierExercise
  | EcouteExercise
  | VraiFauxExercise
  | CompleteExercise
  | ContientExercise
  | OrdreExercise;

export type LanguageExerciseType = LanguageExercise['type'];

export const LANGUAGE_EXERCISE_TYPES: readonly LanguageExerciseType[] = [
  'premiere_lettre',
  'chasse',
  'relier',
  'ecoute',
  'vrai_faux',
  'complete',
  'contient',
  'ordre',
] as const;

/** Types non notés du moteur (NOSCORE). */
export const NOSCORE_TYPES: readonly string[] = [
  'question',
  'tracer',
  'coloriage',
  'carnet',
  'memo',
  'dessin',
] as const;

/** Exercice d'un autre type (Religion, V1) : conservé tel quel. */
export interface OtherExercise extends ExerciseCommon {
  type: string;
}

export type Exercise = LanguageExercise | OtherExercise;

// ---------------------------------------------------------------- leçon

export interface Lettre {
  l: ArText;
  nom_ar?: ArText;
  nom_fr?: string;
  points_ar?: ArText;
  points_fr?: string;
  formes?: ArText[];
  [extra: string]: unknown;
}

export interface Verset {
  ar: ArText;
  fr?: string;
  ref_fr?: string;
  consigne_fr?: string;
  non_prepare?: boolean;
  [extra: string]: unknown;
}

export interface Coran {
  titre_ar?: ArText;
  titre_fr?: string;
  versets?: Verset[];
  mots?: Array<{ ar: ArText; tr?: string; fr?: string; ref?: string }>;
  tafsir_fr?: string;
  tajwid?: { titre_fr?: string; texte_fr?: string; exemple_ar?: ArText; guide_fr?: string };
  non_prepare?: boolean;
  [extra: string]: unknown;
}

export type UnitKind = 'lecon' | 'bilan' | 'examen';

export interface Lesson {
  n: number;
  type: UnitKind;
  num_lecon?: number;
  n_ar?: ArText;
  titre_ar: ArText;
  titre_fr: string;
  lettres?: Lettre[];
  objectifs?: Bilingual[];
  scene?: Record<string, unknown>;
  lecture?: {
    syllabes?: Array<{ ar: ArText; tr?: string }>;
    ligne?: ArText[];
    vedette?: { ar: ArText; tr?: string; fr?: string; note_fr?: string };
    phrases?: Bilingual[];
    [extra: string]: unknown;
  };
  mots?: Array<{ ar: ArText; tr?: string; fr: string; img?: string }>;
  exercices?: Exercise[];
  dialogue?: {
    titre_ar?: ArText;
    titre_fr?: string;
    repliques?: Array<{ qui?: string; qui_ar?: ArText; ar: ArText; fr?: string }>;
    [extra: string]: unknown;
  };
  coran?: Coran;
  fiqh_adab?: Record<string, unknown>;
  ecriture?: Record<string, unknown>;
  checklist?: Bilingual[];
  retiens?: Bilingual[];
  parents_fr?: string;
  travail_perso_fr?: string;
  guide?: Record<string, unknown>;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------- niveau, index, carnets

export interface Book {
  code: string;
  code_fr?: string;
  public_fr?: string;
  titre_ar?: ArText;
  titre_fr?: string;
  niveau_fr?: string;
  [extra: string]: unknown;
}

export interface LessonIndexEntry {
  /** type d'unité */
  t: UnitKind;
  /** numéro affiché (num_lecon, ou rang du bilan) */
  n: number;
  /** titre français */
  f: string;
}

export interface HifzBook {
  code: string;
  filiere?: string;
  n?: number;
  niveau_fr?: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------- résultat d'import

export type Severity = 'erreur' | 'avertissement';

export interface Issue {
  severity: Severity;
  code: string;
  file?: string;
  unit?: string;
  message: string;
}

export interface ImportedExercise {
  /** identifiant de position stable : `<unité>.ex<k>` (k à partir de 1) */
  id: string;
  /** empreinte du contenu (SHA-256 du JSON canonique, 64 hex) */
  hash: string;
  /** clé complète : `<id>#<12 premiers hex de l'empreinte>` */
  key: string;
  position: number;
  type: string;
  graded: boolean;
  itemCount: number;
  content: Exercise;
}

export interface ImportedUnit {
  /** `<niveau>.l<NN>` = clé d'index-lecons.js */
  id: string;
  level: string;
  file: string;
  n: number;
  kind: UnitKind;
  numLecon: number | null;
  numBilan: number | null;
  titreAr: ArText;
  titreFr: string;
  /** SHA-256 du JSON canonique de l'unité (sans normalisation) */
  sha256: string;
  strict: boolean;
  content: Lesson;
  exercises: ImportedExercise[];
}

export interface ImportedLevel {
  code: string;
  book: Book;
  units: ImportedUnit[];
}
