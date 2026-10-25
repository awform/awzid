/**
 * Mutashābihāt — test au hasard qui MÉLANGE LES JUMEAUX (25/10/2026) : trois exercices, générés ici de façon PURE à partir
 * des deux versets Tanzil (mots = `texte.split(' ')`, rangs des données du référent) :
 *  1. « suite »   : le début du verset est affiché, on choisit la bonne suite entre les deux formes ;
 *  2. « mot »     : le mot qui change est masqué, on choisit entre les variantes ;
 *  3. « sourate » : le verset est affiché, on dit dans quelle sourate il se trouve.
 * Les jumeaux ne sont proposés que si les DEUX versets sont déjà mémorisés (au moins deux membres du groupe appris).
 * Le texte n'est jamais retapé : seulement des morceaux de `split(' ')` des versets reçus.
 */
import { dansMemorise, type Plage } from '$lib/hifz-outils/outils';
import { toutesLesPaires, type Jumeau, type RefVerset } from './paires';

export type TypeQuestion = 'suite' | 'mot' | 'sourate';
export const TYPES: readonly TypeQuestion[] = ['suite', 'mot', 'sourate'];

interface Base {
  /** verset interrogé et son jumeau */
  moi: RefVerset;
  autre: RefVerset;
  /** rang du mot en jeu dans mon verset (pour la carte des erreurs) ; -1 : le verset entier */
  rang: number;
  id: string;
}
export interface QSuite extends Base {
  type: 'suite';
  /** mots montrés (le début du verset) */
  debut: string[];
  /** deux formes de la suite (mots), dans un ordre mélangé */
  choix: Array<{ mots: string[]; juste: boolean }>;
}
export interface QMot extends Base {
  type: 'mot';
  mots: string[];
  /** rang du mot masqué dans `mots` */
  trou: number;
  choix: Array<{ mot: string; juste: boolean }>;
}
export interface QSourate extends Base {
  type: 'sourate';
  mots: string[];
  choix: Array<{ s: number; juste: boolean }>;
}
export type Question = QSuite | QMot | QSourate;

export type Hasard = () => number;
const entier = (n: number, r: Hasard) => Math.min(n - 1, Math.floor(r() * n));
export function melanger<T>(l: readonly T[], r: Hasard = Math.random): T[] {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) {
    const j = entier(i + 1, r);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const mots = (texte: string) => texte.split(' ');

/** Paires dont les deux versets sont mémorisés (vues dans les deux sens). */
export function pairesMemorisees(plages: readonly Plage[]): Jumeau[] {
  const ok = (r: RefVerset) => dansMemorise({ s: r.s, from: r.a, to: r.a }, plages);
  return toutesLesPaires().filter((j) => ok(j.moi) && ok(j.autre));
}

/**
 * Une question sur le verset `moi` de la paire `j` (ses deux textes Tanzil donnés), du type demandé ; null si ce type n'a
 * pas de sens pour cette paire (par ex. pas de mot qui change des deux côtés, même sourate).
 */
export function question(
  type: TypeQuestion,
  j: Jumeau,
  texteMoi: string,
  texteAutre: string,
  r: Hasard = Math.random,
): Question | null {
  const m = mots(texteMoi);
  const o = mots(texteAutre);
  const base = (rang: number): Base => ({ moi: j.moi, autre: j.autre, rang, id: j.id });
  // premier mot qui change des DEUX côtés (rangs connus, mots différents)
  const d = j.diffs.find(
    ([x, y]) =>
      x !== null && y !== null && m[x] !== undefined && o[y] !== undefined && m[x] !== o[y],
  );
  if (type === 'sourate') {
    if (j.moi.s === j.autre.s) return null;
    return {
      ...base(d?.[0] ?? -1),
      type,
      mots: m,
      choix: melanger(
        [
          { s: j.moi.s, juste: true },
          { s: j.autre.s, juste: false },
        ],
        r,
      ),
    };
  }
  if (!d) return null;
  const [x, y] = d as [number, number];
  if (type === 'mot')
    return {
      ...base(x),
      type,
      mots: m,
      trou: x,
      choix: melanger(
        [
          { mot: m[x]!, juste: true },
          { mot: o[y]!, juste: false },
        ],
        r,
      ),
    };
  // suite : il faut un début à montrer ; la suite = quelques mots à partir du premier mot qui change
  if (x < 1) return null;
  const suite = (l: string[], k: number) => l.slice(k, k + 3);
  const a = suite(m, x);
  const b = suite(o, y);
  if (a.join(' ') === b.join(' ')) return null;
  return {
    ...base(x),
    type,
    debut: m.slice(0, x),
    choix: melanger(
      [
        { mots: a, juste: true },
        { mots: b, juste: false },
      ],
      r,
    ),
  };
}

/** Types possibles pour une paire (dans un ordre mélangé) : le premier qui donne une question est posé. */
export function questionHasard(
  j: Jumeau,
  texteMoi: string,
  texteAutre: string,
  r: Hasard = Math.random,
): Question | null {
  for (const t of melanger(TYPES, r)) {
    const q = question(t, j, texteMoi, texteAutre, r);
    if (q) return q;
  }
  return null;
}
