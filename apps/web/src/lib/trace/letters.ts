/**
 * Lettres à tracer (28 lettres et lām-alif) et leurs formes. Les points et petites marques sont lus sur
 * la lettre dessinée par la police du cahier : cette table ne donne que le départ du tracé et les formes
 * possibles [À RELIRE par un enseignant : départs et formes proposées].
 */
import type { Start } from './evaluate';

export type Form = 'isolee' | 'debut' | 'milieu' | 'fin';

export interface LetterModel {
  l: string;
  start: Start;
  /** lettres qui ne se lient pas à la suivante : seulement isolée et finale */
  forms: readonly Form[];
}

const ALL: readonly Form[] = ['isolee', 'debut', 'milieu', 'fin'];
const TWO: readonly Form[] = ['isolee', 'fin'];

export const LETTERS: readonly LetterModel[] = [
  { l: 'ا', start: 'haut', forms: TWO },
  { l: 'ب', start: 'droite', forms: ALL },
  { l: 'ت', start: 'droite', forms: ALL },
  { l: 'ث', start: 'droite', forms: ALL },
  { l: 'ج', start: 'droite', forms: ALL },
  { l: 'ح', start: 'droite', forms: ALL },
  { l: 'خ', start: 'droite', forms: ALL },
  { l: 'د', start: 'droite', forms: TWO },
  { l: 'ذ', start: 'droite', forms: TWO },
  { l: 'ر', start: 'droite', forms: TWO },
  { l: 'ز', start: 'droite', forms: TWO },
  { l: 'س', start: 'droite', forms: ALL },
  { l: 'ش', start: 'droite', forms: ALL },
  { l: 'ص', start: 'droite', forms: ALL },
  { l: 'ض', start: 'droite', forms: ALL },
  { l: 'ط', start: 'droite', forms: ALL },
  { l: 'ظ', start: 'droite', forms: ALL },
  { l: 'ع', start: 'droite', forms: ALL },
  { l: 'غ', start: 'droite', forms: ALL },
  { l: 'ف', start: 'droite', forms: ALL },
  { l: 'ق', start: 'droite', forms: ALL },
  { l: 'ك', start: 'haut', forms: ALL },
  { l: 'ل', start: 'haut', forms: ALL },
  { l: 'م', start: 'droite', forms: ALL },
  { l: 'ن', start: 'droite', forms: ALL },
  { l: 'ه', start: 'droite', forms: ALL },
  { l: 'و', start: 'droite', forms: TWO },
  { l: 'ي', start: 'droite', forms: ALL },
  { l: 'لا', start: 'haut', forms: TWO },
];

const ZWJ = '‍';

/** Texte à dessiner pour une forme (liaisons par le joint sans chasse). */
export function formText(l: string, f: Form): string {
  switch (f) {
    case 'debut':
      return l + ZWJ;
    case 'milieu':
      return ZWJ + l + ZWJ;
    case 'fin':
      return ZWJ + l;
    default:
      return l;
  }
}

export function letterModel(l: string): LetterModel | undefined {
  return LETTERS.find((x) => x.l === l);
}
