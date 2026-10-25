export interface Mesure {
  a: number;
  b: number;
  s: Array<[number, number]>;
}
export function mesurer(mp3: string): Mesure & { duree: number };
export function analyser(texte: string, duree: number): Mesure;
