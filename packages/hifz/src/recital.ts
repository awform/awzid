/**
 * Récital de fin de niveau (carnets, CDC §2.6-6) : tirage au sort de 3 passages du socle (+ 1 du renforcé si
 * l'élève suit le parcours renforcé) + un passage au choix de l'élève ; jury : le maître (+ second récitant
 * facultatif) ; conversion pour l'examen du manuel : note Coran /15 = récital /20 × 0,75.
 * Les passages sont ceux du carnet (jamais inventés) ; l'application ne reproduit pas le texte récité.
 */
import { entryKey, type HifzBookData } from './book.js';

export type Parcours = 'socle' | 'renforce';

/** nombre de passages tirés dans le socle */
export const RECITAL_SOCLE = 3;

/** Passages du carnet (clés « 112:1-4 »), sans doublon, dans l'ordre du carnet. */
export function recitalPool(book: HifzBookData, parcours: 'socle' | 'renforce'): string[] {
  const list = parcours === 'socle' ? book.parcours.socle : (book.parcours.renforce ?? []);
  return [...new Set(list.map(entryKey))];
}

/** Tous les passages que l'élève peut choisir (socle, et renforcé si ce parcours est suivi). */
export function recitalChoices(book: HifzBookData, parcours: Parcours): string[] {
  const socle = recitalPool(book, 'socle');
  return parcours === 'renforce'
    ? [...new Set([...socle, ...recitalPool(book, 'renforce')])]
    : socle;
}

/**
 * Tirage sans remise de `n` éléments ; `rand(k)` renvoie un entier uniforme dans [0, k) (le serveur utilise
 * crypto.randomInt). Moins d'éléments que `n` : tous, dans l'ordre du tirage.
 */
export function drawWithout<T>(pool: readonly T[], n: number, rand: (k: number) => number): T[] {
  const rest = [...pool];
  const out: T[] = [];
  while (out.length < n && rest.length) out.push(rest.splice(rand(rest.length), 1)[0]!);
  return out;
}

/** Passages tirés au sort pour un élève : 3 du socle, + 1 du renforcé (s'il en reste) au parcours renforcé. */
export function drawRecital(
  book: HifzBookData,
  parcours: Parcours,
  rand: (k: number) => number,
): string[] {
  const socle = drawWithout(recitalPool(book, 'socle'), RECITAL_SOCLE, rand);
  if (parcours !== 'renforce') return socle;
  const extra = recitalPool(book, 'renforce').filter((k) => !socle.includes(k));
  return [...socle, ...drawWithout(extra, 1, rand)];
}

/** Note Coran /15 de l'examen du manuel = récital /20 × 0,75, arrondie au quart de point. */
export function coranNote15(total20: number): number {
  const x = Math.max(0, Math.min(20, total20)) * 0.75;
  return Math.round(x * 4) / 4;
}
