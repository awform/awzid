/**
 * Barème du maître (carnets, « bareme ») : note sur 20 = mémorisation 10 + tajwid 6 + fluidité et bonne
 * conduite 4. Règle absolue : un verset oublié deux fois → « à reprendre », quelle que soit la note.
 * Le maître reste le seul juge : ce calcul reprend seulement ses relevés.
 */
import type { Quality } from './engine.js';

export interface Counters {
  /** aide du maître (il souffle le mot) : − 1 */
  aides: number;
  /** hésitation corrigée seul(e) : − 0,5 */
  hesitations: number;
  /** verset sauté ou inversé, corrigé après signal : − 1,5 */
  sauts: number;
  /** verset oublié (aide de plus d'un mot) : − 2 */
  oublis: number;
  /** faute claire : − 1 */
  claires: number;
  /** faute discrète sur une règle du niveau : − 0,5 */
  discretes: number;
  /** fluidité et bonne conduite : 0 à 4 points */
  fluidite: number;
}

export type Mention = 'excellent' | 'tres_bien' | 'bien' | 'a_consolider' | 'a_reprendre';

export interface Note {
  memorisation: number;
  tajwid: number;
  fluidite: number;
  total: number;
  mention: Mention;
  /** « oui », « provisoire » (nouvelle récitation sous 2 semaines) ou « non » */
  validation: 'oui' | 'provisoire' | 'non';
}

/** compteur absent : 0 ; négatif : 0 ; infini ou non numérique : ERREUR (audit MET-3 : jamais une note parfaite) */
const nonNeg = (n: number | undefined | null) => {
  if (n === undefined || n === null) return 0;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new RangeError('compteur_invalide');
  return n > 0 ? n : 0;
};

export function note(c: Counters): Note {
  const memorisation = Math.max(
    0,
    10 -
      nonNeg(c.aides) -
      0.5 * nonNeg(c.hesitations) -
      1.5 * nonNeg(c.sauts) -
      2 * nonNeg(c.oublis),
  );
  const tajwid = Math.max(0, 6 - nonNeg(c.claires) - 0.5 * nonNeg(c.discretes));
  const fluidite = Math.min(4, nonNeg(Math.round(c.fluidite)));
  const total = memorisation + tajwid + fluidite;
  let mention: Mention =
    total >= 18
      ? 'excellent'
      : total >= 16
        ? 'tres_bien'
        : total >= 14
          ? 'bien'
          : total >= 12
            ? 'a_consolider'
            : 'a_reprendre';
  if (nonNeg(c.oublis) >= 2) mention = 'a_reprendre';
  const validation =
    mention === 'a_reprendre' ? 'non' : mention === 'a_consolider' ? 'provisoire' : 'oui';
  return { memorisation, tajwid, fluidite, total, mention, validation };
}

/** Qualité de révision déduite de la note du maître. */
export function qualityOf(n: Note): Quality {
  switch (n.mention) {
    case 'excellent':
    case 'tres_bien':
      return 3;
    case 'bien':
      return 2;
    case 'a_consolider':
      return 1;
    default:
      return 0;
  }
}
