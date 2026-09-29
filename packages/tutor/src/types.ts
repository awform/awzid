/**
 * Types des tuteurs IA (ARCHITECTURE_V2 § 1). Le modèle ne produit qu'un BROUILLON structuré ; l'application
 * le filtre, remplace les références ({{coran:…}}, {{registre:…}}, {{explication:…}}) par le texte validé
 * et décide seule de ce qui est affiché, transmis ou journalisé.
 */

/** Public du tuteur : moins de 13 ans → boutons seulement (§ 1.7). */
export type Audience = 'enfant' | 'ado' | 'adulte';

/** Boutons proposés à l'élève (les seuls moyens d'un enfant). */
export type TutorAction = 'indice' | 'explique' | 'lecon' | 'mot' | 'question';

export interface TutorRequest {
  audience: Audience;
  /** bouton choisi ; « question » = texte libre (ados et adultes seulement) */
  action: TutorAction;
  /** texte libre (ados/adultes), 300 caractères au plus */
  text?: string;
  /** mot demandé (bouton « Je ne comprends pas le mot… ») */
  word?: string;
  /** heure locale de l'appareil (0-23) : pas de tuteur pour un enfant entre 21 h et 7 h */
  hour?: number;
  /** pays du compte (numéros d'aide) */
  country?: string | null;
  /** nombre d'appels déjà faits sur cette leçon (rotation des indices) */
  turn?: number;
}

/** Entrée de la banque d'explications VALIDÉES (§ 1.4). */
export interface Explanation {
  id: string;
  notion: string;
  texteFr: string;
  ar?: string;
  source: string;
  statut: 'valide' | 'proposee' | 'retiree';
}

/** Élément du registre citable (hadith au statut VERIFIE uniquement). */
export interface RegistryItem {
  id: string;
  statut: string;
  recueil?: string;
  numero?: number | string;
  degre?: string;
  texteAr?: string;
  rapporteur?: string;
}

/** Contexte en LECTURE SEULE fourni au modèle (outils du § 1.3 exécutés par l'orchestrateur). */
export interface ContextPack {
  unitId: string;
  titreFr: string;
  bank: Explanation[];
  /** références coraniques de la leçon (« 112:1-4 ») — jamais le texte */
  coranRefs: string[];
  /** hadiths de la leçon présents au registre en statut VERIFIE */
  registre: RegistryItem[];
}

/** Décision du tuteur (sortie structurée du modèle). */
export type Decision = 'repondre' | 'transmettre' | 'recadrer' | 'proteger';

export interface TutorDraft {
  decision: Decision;
  /** message en français ; peut contenir {{coran:s:a-b}}, {{registre:ID}}, {{explication:ID}} */
  message_fr: string;
}

/** Segment rendu à l'écran (le client n'interprète aucun texte libre comme du Coran). */
export type Segment =
  | { t: 'texte'; v: string }
  | { t: 'coran'; ref: string; s: number; from: number; to: number; text: string }
  | {
      t: 'registre';
      id: string;
      recueil?: string;
      numero?: string;
      degre?: string;
      texteAr?: string;
    }
  | { t: 'explication'; id: string; texteFr: string; ar?: string; source: string };

export type Route =
  | 'politique'
  | 'protection'
  | 'transmission'
  | 'recadrage'
  | 'injection'
  | 'coran_local'
  | 'hadith_local'
  | 'banque_locale'
  | 'modele'
  | 'repli';

/** Événement du filtre de sortie, journalisé. */
export interface FilterEvent {
  step: string;
  action: 'bloque' | 'corrige' | 'ok';
  detail?: string;
}

export interface TutorResult {
  decision: Decision;
  route: Route;
  segments: Segment[];
  /** question transmise à l'enseignant (l'application l'enregistre) */
  transmit?: { text: string; motif: string };
  /** alerte à la modération humaine (détresse, rencontre) */
  alert?: { motif: string };
  filter: FilterEvent[];
  provider: string;
  model: string | null;
  roleId: string;
  roleVersion: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  costMicros: number;
  /** motif d'un refus de politique (âge, horaire, plafond, désactivé) */
  refused?: string;
}
