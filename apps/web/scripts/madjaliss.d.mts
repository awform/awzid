// Types de scripts/madjaliss.mjs (lus par les tests unitaires ; le script lui-même reste en JavaScript).
export const SOURCES: string;
export const SORTIE: string;
export const STATUT: 'VALIDATION_HUMAINE_REQUISE';
export const AVEC_EXPLICATION: Set<string>;
export const CITATIONS: Record<
  string,
  { s: number; a: number; mots: [number, number]; remplace?: string; auteur?: string }
>;
export const SECTIONS_PUDEUR: Set<string>;
export const SENS_A_VERIFIER: RegExp;
export const NOTE_A_VERIFIER: RegExp;
export function tanzil(): Map<string, string>;
export function sensVerset(s: number, a: number): { texte: string; cle: string; version: string };
export function portion(
  lignes: Map<string, string>,
  s: number,
  a: number,
  mots: [number, number],
): string;
export function construire(
  texte?: string,
  lignes?: Map<string, string>,
): { eleve: unknown; enseignant: unknown };
