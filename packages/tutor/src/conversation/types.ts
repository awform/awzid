/**
 * Tuteur IA de CONVERSATION en arabe (19/10/2026, docs/projet/TUTEUR_IA.md) — types communs.
 *
 * Trois étages, le local d'abord :
 *  1. « guidee » : dialogue des livres, écoute par l'IA LOCALE (ecoute-ia), comparaison à la réplique attendue ;
 *     aucun appel à un modèle de langage ; seul mode des enfants ;
 *  2. « libre » : conversation avec Gemini (Vertex AI, région UE), vocabulaire du niveau, ados (accord parental)
 *     et adultes, à partir du niveau 2 ;
 *  3. (plus tard, non codé) assistant de révision limité à nos contenus audités.
 * Le modèle ne rend qu'un BROUILLON JSON ; l'application le filtre (religion, Coran, données personnelles) et
 * décide seule de ce qui est affiché, lu à voix haute et journalisé.
 */
import type { Audience } from '../types.js';

export type Etage = 'guidee' | 'libre';
/** forme d'adresse en français (tutoiement : enfants et ados ; vouvoiement : adultes, sauf choix contraire) */
export type Adresse = 'tu' | 'vous';
/** genre grammatical pour s'adresser à l'élève en arabe (« x » : inconnu, formes neutres autant que possible) */
export type Genre = 'm' | 'f' | 'x';

export interface Replique {
  qui: string;
  ar: string;
  fr?: string;
}
export interface MotNiveau {
  ar: string;
  fr?: string;
}

/** Contexte en LECTURE SEULE donné au modèle : tiré des livres (dialogue de la leçon, mots déjà vus). */
export interface ConvContexte {
  unitId: string;
  /** code du niveau (ad2, ado3…) */
  niveau: string;
  /** numéro de la leçon dans le niveau */
  lecon: number;
  titreFr?: string;
  lieu?: string;
  /** dialogue de la leçon (texte des livres, inchangé) */
  dialogue: Replique[];
  /** mots des leçons du niveau jusqu'à celle-ci (et des niveaux précédents de la filière), du livre */
  mots: MotNiveau[];
}

export interface Tour {
  de: 'eleve' | 'tuteur';
  ar: string;
}

export interface ConvEntree {
  audience: Audience;
  adresse: Adresse;
  genre: Genre;
  contexte: ConvContexte;
  /** derniers échanges (au plus HISTORIQUE_MAX), gardés par l'appareil, jamais en base */
  historique: Tour[];
  /** ce que l'élève a écrit (mode texte), 300 caractères au plus */
  texte?: string;
  /** ce que l'élève a dit (mode voix), 20 s au plus ; jamais conservé */
  audio?: { mime: string; data: Buffer; secondes: number };
}

/** Brouillon structuré rendu par le modèle (schéma CONV_SCHEMA), NON fiable. */
export interface ConvBrouillon {
  /** ce que le modèle a compris de l'élève (arabe), vide en mode texte */
  transcription_ar: string;
  /** réponse du tuteur, arabe littéral du niveau, 2 phrases courtes au plus */
  reponse_ar: string;
  /** traduction française de la réponse */
  reponse_fr: string;
  /** correction douce (null si rien à corriger) */
  correction: { dit: string; correct: string; explication_fr: string } | null;
  /** sujet de l'élève : « langue » (normal), « religion » (renvoi), « autre » (hors sujet) */
  sujet: 'langue' | 'religion' | 'autre';
}

export interface ConvUsage {
  /** jetons d'entrée texte (invite système, contexte, historique) */
  texte: number;
  /** jetons d'entrée audio (≈ 32 par seconde) */
  audio: number;
  /** jetons de sortie (réponse + réflexion) */
  sortie: number;
}

export interface ConvSortieFournisseur {
  status: 'ok' | 'refus' | 'erreur';
  brouillon: unknown;
  usage: ConvUsage;
  detail?: string;
  /** message technique du fournisseur (erreur de l'API, réglage ignoré), borné ; jamais montré à l'élève */
  message?: string;
}

/** Fournisseur de conversation (Gemini sur Vertex, ou simulé). Ne connaît ni la base ni les plafonds. */
export interface ConvFournisseur {
  readonly name: string;
  /** vrai : appel réel facturé */
  readonly real: boolean;
  readonly modele: string;
  repondre(systeme: string, entree: ConvEntree): Promise<ConvSortieFournisseur>;
}

/** Brouillon de l'appel de PRONONCIATION (schéma PRONON_SCHEMA), NON fiable : l'application vérifie. */
export interface PrononBrouillon {
  /** sons entendus, lettre par lettre */
  entendu: string;
  /** phrase voulue, écrite correctement */
  voulu: string;
  fautes: Array<{ entendu: string; correct: string }>;
}

/** Fournisseur de l'appel de prononciation (oral seulement), lancé en parallèle de la conversation. */
export interface PrononFournisseur {
  readonly name: string;
  readonly real: boolean;
  readonly modele: string;
  ecouter(
    systeme: string,
    audio: { mime: string; data: Buffer },
    /** mots du livre (utilisés par le simulé seulement ; jamais envoyés au modèle de prononciation) */
    ctx?: { mots: readonly MotNiveau[] },
  ): Promise<ConvSortieFournisseur>;
}

/** Synthèse vocale (Google Cloud TTS, voix arabe des leçons ; ou simulée). */
export interface Synthese {
  readonly name: string;
  readonly real: boolean;
  /** null : échec (la réponse reste affichée, sans voix) */
  lire(texteAr: string): Promise<{ mime: string; data: Buffer; caracteres: number } | null>;
}

export const HISTORIQUE_MAX = 8;
export const TEXTE_MAX = 300;
export const AUDIO_MAX_S = 20;
