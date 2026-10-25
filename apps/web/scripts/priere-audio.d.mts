export interface EntreeAudio {
  id: string;
  ar: string;
  type?: string;
  titre?: string;
}
export interface Liste {
  niveaux: string;
  texte: string;
}
export interface Classes {
  aGenerer: Array<{ sha: string; ar: string; ids: string[] }>;
  existants: Array<{ sha: string; ar: string; ids: string[]; niveaux: string }>;
  interdits: Array<EntreeAudio & { raison: string }>;
}
export function contientBasmala(ar: string): boolean;
export function collecter(priere: unknown): EntreeAudio[];
export function classer(entrees: EntreeAudio[], liste: Map<string, Liste>): Classes;
export function lireListe(chemin: string): Map<string, Liste>;
export function tableaux(classes: Classes): Record<string, string>;
