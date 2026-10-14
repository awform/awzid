// Types de scripts/madjaliss.mjs (lus par les tests unitaires ; le script lui-même reste en JavaScript).
export const SOURCES: string;
export const SORTIE: string;
export const STATUT: 'EN_ATTENTE_SECONDE_LECTURE';
export const STATUTS_ACCEPTES: Set<string>;
export const TEXTES: string[];
export const PHRASE_INTERNE_RISALA: RegExp;
export const LIEN_NUMERISATION: RegExp;
export const TEXTES_LOT4: string[];
export const TOUS_LES_TEXTES: string[];
export const TAILLE_PARTIE: number;
export const DIFFERE_CYCLE: Record<string, { cycle_min: number; consigne: RegExp }>;
export const DIFFERE: Record<string, { seances: string[]; consigne: RegExp }>;
export function departager(
  eleve: {
    id: string;
    phrases: Array<{ id: string }>;
    seances: Array<{ n: number; phrases: string[] }>;
  },
  taille?: number,
  raisons?: Map<number, string>,
): {
  index: {
    phrases: unknown[];
    seances: Array<{ n: number; p: number }>;
    parts: Array<{ n: number; version: string; o?: true }>;
  };
  fichiers: Array<{
    v: number;
    id: string;
    part: number;
    /** partie PUBLIQUE (séances ouvertes, `-o<k>`) ou gardée (`-p<k>`) ; non écrit dans le fichier */
    pub: boolean;
    version: string;
    phrases: Array<{ id: string }>;
    raisons?: Record<string, string>;
  }>;
};
export const MARQUEUR: RegExp;
export const TRANSLIT: RegExp;
export const ARABE_LIGNE: RegExp;
export const AVEC_EXPLICATION: Set<string>;
export const NOTE_RETIENT: RegExp;
export const SECTIONS_PUDEUR: Set<string>;
export const SENS_A_VERIFIER: RegExp;
export const NOTE_A_VERIFIER: RegExp;
export const TRANSLIT_A_PRECISER: string[];
export const MOT_A_PRECISER: string;
export const PHRASE_INTERNE: RegExp;
export const SOURCE_INTERNE: RegExp;
export const CHAMPS_INTERNES: string[];
export function dossier(texte: string): string;
export function tanzil(): Map<string, string>;
export function sensVerset(s: number, a: number): { texte: string; cle: string; version: string };
export function decouperCoran(
  id: string,
  arabe: string,
  coran: unknown,
  lignes: Map<string, string>,
): { morceaux: Array<string | { q: string; ref: string }>; versets: unknown[] };
export function nettoyerNote(texte: string): string;
export function reparerApostrophes(texte: string): string;
export function sensMotEleve(sens: string): string;
export function expanser(texte: string, mots?: readonly string[]): string;
export function isoler(texte: string, mots?: readonly string[]): { texte: string; mots: string[] };
export function entitesHtml(s: string): string;
export function ordreSeances(texte: string): Array<{ id: string; [k: string]: unknown }>;
/** Texte de l'élève tel que construit (avant séparation des fichiers publics et gardés). */
export interface TexteConstruit {
  v: number;
  id: string;
  version: string;
  statut: string;
  phrases: Array<{ id: string }>;
  seances: Array<{ n: number; id: string; phrases: string[]; differe?: true }>;
  [k: string]: unknown;
}
export function construire(
  texte?: string,
  lignes?: Map<string, string>,
): {
  eleve: TexteConstruit;
  enseignant: { version: string; [k: string]: unknown };
  /** raison de la publication différée, par numéro de séance (partie gardée seulement) */
  raisons: Map<number, string>;
  /** versions complètes des vers masqués (marquées `nc`), pour le complément gardé */
  versNonConfirmes: Array<{ id: string; nc?: true; [k: string]: unknown }>;
};
/** Lot 5 : dossier des fichiers GARDÉS (servis après authentification, jamais dans static/). */
export const SORTIE_PROTEGEE: string;
export const NOM_PROTEGE: RegExp;
export function separerDiffere(
  eleve: TexteConstruit,
  nonConfirmes?: Array<{ id: string; [k: string]: unknown }>,
): {
  publique: TexteConstruit & { differe?: { version: string } };
  differe: {
    v: number;
    id: string;
    version: string;
    statut: string;
    seances: unknown[];
    phrases: unknown[];
  } | null;
};
export function ecrireTexte(
  texte: string,
  lignes?: Map<string, string>,
  sortie?: string,
  protegee?: string,
): { eleve: TexteConstruit; publique: unknown };
export function versMasques(
  ar: unknown,
  se: unknown,
  seancesSrc: unknown[],
): Map<string, { decision: string; raison_masquage: string; lecture_proposee: string }>;
