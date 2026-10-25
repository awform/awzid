/**
 * Cahiers de lecture des enfants et des ados (25/10/2026) — règles PURES (testées) des jeux de fin de grille :
 * quels jeux sont ouverts, quelles manches et quels mots sont jouables, vérification d'un mot construit, médailles.
 * Les signes sont dessinés par leurs points de code (aucun texte arabe tapé ici, aucune transcription latine : le signe
 * est montré par lui-même, sur un cercle pointillé, et par son son).
 */
import type { JeuPage, Manche, MotJeu, SigneCle, SigneJeu } from '../donnees';
import { ouvert } from '../outils';

const c = (...cs: number[]) => String.fromCharCode(...cs);
/** marques de chaque signe (la chadda précède sa voyelle, comme dans le cahier) */
export const MARQUES: Record<SigneCle, string> = {
  fatha: c(0x64e),
  kasra: c(0x650),
  damma: c(0x64f),
  soukoun: c(0x652),
  fathatan: c(0x64b),
  kasratan: c(0x64d),
  dammatan: c(0x64c),
  shadda_fatha: c(0x651, 0x64e),
  shadda_kasra: c(0x651, 0x650),
  shadda_damma: c(0x651, 0x64f),
};
/** cercle pointillé (U+25CC) : porte le signe montré seul */
export const CERCLE = c(0x25cc);

export type Public = 'enfant' | 'ado' | 'adulte';
/** public du cahier d'un niveau : `en1` enfants, `ado1` ados, `ad1` adultes */
export const publicDe = (niveau: string): Public =>
  /^en\d/.test(niveau) ? 'enfant' : /^ado\d/.test(niveau) ? 'ado' : 'adulte';

export type JeuId = 'colorie' | 'construis' | 'trouve' | 'chrono' | 'duel';
/** jeux proposés, dans l'ordre : les enfants jouent, les ados ont défis, score et médailles */
export const JEUX_DU_PUBLIC: Record<Public, readonly JeuId[]> = {
  enfant: ['construis', 'trouve', 'colorie'],
  ado: ['chrono', 'construis', 'duel'],
  adulte: [],
};

/** ce que le jeu sait de l'élève et de l'appareil */
export interface ContexteJeu {
  /** leçon atteinte (null : inconnue, tout est ouvert) */
  atteinte: number | null;
  /** le texte a-t-il son fichier audio ? (`s` syllabe, `t` mot) */
  audioOk: (ar: string, nature: 's' | 't') => boolean;
}

/** longueur maximale d'un mot à construire : de grandes cases pour les enfants */
export const LONGUEUR_MAX: Record<Public, number> = { enfant: 4, ado: 6, adulte: 6 };
/** nombre minimal de mots / de manches pour proposer un jeu */
export const MOTS_MIN: Record<Public, number> = { enfant: 2, ado: 3, adulte: 3 };
export const MANCHES_MIN = 4;
/** manches d'une partie : trouve (enfants) 8, défi chrono 10, duel 5 par joueur */
export const MANCHES = { trouve: 8, chrono: 10, duelParJoueur: 5 } as const;
/** mots d'une partie de « Construis le mot » */
export const MOTS_PARTIE: Record<Public, number> = { enfant: 3, ado: 5, adulte: 3 };

export const motsJouables = (jeu: JeuPage, ctx: ContexteJeu, pub: Public): MotJeu[] =>
  jeu.construis.filter(
    (m) =>
      ouvert(m.n, ctx.atteinte) &&
      m.c.length >= 2 &&
      m.c.length <= LONGUEUR_MAX[pub] &&
      ctx.audioOk(m.ar, 't'),
  );

export const manchesJouables = (jeu: JeuPage, ctx: ContexteJeu, k?: 's' | 'm'): Manche[] =>
  jeu.trouve.filter(
    (m) =>
      (!k || m.k === k) &&
      ouvert(m.n, ctx.atteinte) &&
      ctx.audioOk(m.cible, m.k === 's' ? 's' : 't') &&
      m.choix.length >= 4,
  );

/** signes ouverts (enseignés à la leçon atteinte), dans l'ordre du livre */
export const signesOuverts = (jeu: JeuPage, ctx: ContexteJeu): SigneJeu[] =>
  jeu.signes.filter((s) => ouvert(s.n, ctx.atteinte));

export function colorieJouable(jeu: JeuPage, ctx: ContexteJeu) {
  const cases = (jeu.colorie?.cases ?? []).filter(
    (x) => ouvert(x.n, ctx.atteinte) && ctx.audioOk(x.ar, 's'),
  );
  return cases.filter((x) => x.cible).length >= 2 && cases.length >= 6 ? cases : [];
}

/** jeux ouverts de la page, dans l'ordre du public */
export function jeuxOuverts(jeu: JeuPage, ctx: ContexteJeu, pub: Public): JeuId[] {
  const mots = motsJouables(jeu, ctx, pub).length;
  const manches = manchesJouables(jeu, ctx).length;
  return JEUX_DU_PUBLIC[pub].filter((j) => {
    switch (j) {
      case 'construis':
        return mots >= MOTS_MIN[pub];
      case 'trouve':
        return manches >= MANCHES_MIN;
      case 'chrono':
        return manches >= 6;
      case 'duel':
        return manches >= 6;
      case 'colorie':
        return colorieJouable(jeu, ctx).length > 0;
    }
  });
}

/** mélange (Fisher-Yates) avec un générateur injectable : les tests le fixent */
export function melanger<T>(liste: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
export const tirer = <T>(liste: readonly T[], n: number, rnd?: () => number): T[] =>
  melanger(liste, rnd).slice(0, n);

// ———————————————————————————————— Construis le mot ————————————————————————————————
export interface Tuile {
  /** numéro de la tuile dans le plateau (unique dans le mot) */
  id: number;
  l: string;
}
/** les lettres du mot, mélangées ; une partie des mots garde l'ordre si le hasard le redonne (jamais : on re-mélange) */
export function tuilesDuMot(m: MotJeu, rnd: () => number = Math.random): Tuile[] {
  const base = m.c.map(([l], id) => ({ id, l }));
  if (new Set(base.map((t) => t.l)).size < 2) return base;
  for (let i = 0; i < 6; i++) {
    const t = melanger(base, rnd);
    if (t.some((x, j) => x.l !== base[j]!.l)) return t;
  }
  return [...base].reverse();
}
/** cases où il faut poser un signe (les lettres de prolongation n'en ont pas) */
export const casesASigner = (m: MotJeu): number[] => m.c.flatMap(([, s], i) => (s ? [i] : []));
/** justesse de chaque case : la lettre posée est celle du mot à cette place (de droite à gauche : case 0 à droite) */
export const lettresJustes = (m: MotJeu, posees: ReadonlyArray<string | null>): boolean[] =>
  m.c.map(([l], i) => posees[i] === l);
export const signesJustes = (m: MotJeu, poses: ReadonlyArray<SigneCle | null>): boolean[] =>
  m.c.map(([, s], i) => (s ? poses[i] === s : poses[i] == null));
/** mot construit : lettres posées et signes posés (case vide : rien) */
export const motConstruit = (
  posees: ReadonlyArray<string | null>,
  poses: ReadonlyArray<SigneCle | null>,
): string => posees.map((l, i) => (l ?? '') + (l && poses[i] ? MARQUES[poses[i]!] : '')).join('');
/** le mot attendu, recomposé depuis ses cases : doit redonner exactement `ar` (contrôlé par un test) */
export const recomposer = (m: MotJeu): string =>
  m.c.map(([l, s]) => l + (s ? MARQUES[s as SigneCle] : '')).join('');
/** prochaine case vide, en partant de la droite (case 0) */
export const caseSuivante = (posees: ReadonlyArray<string | null>): number =>
  posees.findIndex((x) => x == null);

// ———————————————————————————————— médailles et scores ————————————————————————————————
export type Med = 0 | 1 | 2 | 3;
export const NOM_MED = ['', 'bronze', 'argent', 'or'] as const;
export interface Paliers {
  bronze: number;
  argent: number;
  or: number;
}
/** score à atteindre (au moins) pour chaque médaille */
export function medailleScore(score: number, p: Paliers): Med {
  return score >= p.or ? 3 : score >= p.argent ? 2 : score >= p.bronze ? 1 : 0;
}
/** défi chrono (10 manches) : temps (secondes, erreurs comprises) à ne pas dépasser */
export const PALIERS_CHRONO = { or: 30, argent: 40, bronze: 55 } as const;
export const PENALITE_S = 2;
export const secondesChrono = (ms: number, erreurs: number): number =>
  Math.round((ms / 1000 + erreurs * PENALITE_S) * 10) / 10;
export function medailleChrono(secondes: number): Med {
  return secondes <= PALIERS_CHRONO.or
    ? 3
    : secondes <= PALIERS_CHRONO.argent
      ? 2
      : secondes <= PALIERS_CHRONO.bronze
        ? 1
        : 0;
}
/** « Construis le mot » des ados : mots construits du premier coup sur n (bronze 1, argent 2 sur 3, or tous) */
export const paliersConstruis = (n: number): Paliers => ({
  bronze: 1,
  argent: Math.max(1, Math.ceil((n * 2) / 3)),
  or: n,
});
/** duel : bonnes réponses du premier coup sur n manches (bronze 60 %, argent 80 %, or 100 %) */
export const paliersDuel = (n: number): Paliers => ({
  bronze: Math.ceil(n * 0.6),
  argent: Math.ceil(n * 0.8),
  or: n,
});
/** défi d'une page et mission d'un bilan : paliers du cahier s'il y en a, sinon 70 %, 90 %, 100 % des éléments */
export function paliersDefi(max: number, p?: Paliers): Paliers {
  return p ?? { bronze: Math.ceil(max * 0.7), argent: Math.ceil(max * 0.9), or: max };
}
export type ModeTrouve = 'doux' | 'chrono' | 'duel';
export interface ResultatTrouve {
  mode: ModeTrouve;
  total: number;
  /** bonnes réponses du premier coup (duel : une par joueur) */
  justes: number[];
  erreurs: number;
  ms: number;
  /** défi chrono : temps en secondes, erreurs comprises */
  secondes?: number;
  med: Med;
}
export const gagnantDuel = (a: number, b: number): 0 | 1 | 2 => (a === b ? 0 : a > b ? 1 : 2);
