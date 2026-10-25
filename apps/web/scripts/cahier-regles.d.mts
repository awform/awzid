export type NiveauJeux = 'en1' | 'ado1';
export interface Regles {
  fatha: number;
  kasra: number;
  damma: number;
  longA: number;
  longU: number;
  longI: number;
  soukoun: number;
  tanwin: number;
  shadda: number;
  taMarbuta: number;
  maqsura: number | null;
  hamzaTete: number | null;
  hamzaSiege: number | null;
}
export const REGLES: Record<NiveauJeux, Regles>;
export const MARQUES: Record<string, string>;
export const CLES_SIGNES: string[];
export interface Segment {
  l: string;
  s: string;
  fixe?: true;
}
export function lettresN(src: unknown): Record<string, number>;
export function analyser(
  texte: string,
  niveau: NiveauJeux,
  lettreN: Record<string, number>,
): { ok: boolean; n: number; segs: Segment[] };
export function recomposer(segs: Segment[]): string;
export function signesEnseignes(niveau: NiveauJeux, n: number): string[];
export function leconDuSigne(niveau: NiveauJeux, signe: string): number;
