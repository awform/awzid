/**
 * D1 — leçons d'un niveau groupées par UNITÉ : une unité va jusqu'à son bilan inclus (le livre place un bilan
 * après chaque groupe de leçons) ; l'examen de fin de niveau ferme la dernière unité. L'ordre du livre est
 * conservé tel quel (aucune leçon retirée ni déplacée).
 */
export type EtatUnite = 'fait' | 'en-cours' | 'numero' | 'bilan' | 'examen';

interface U {
  id: string;
  kind: 'lecon' | 'bilan' | 'examen';
  numLecon: number | null;
  n: number;
  statut: string | null;
}

export interface Groupe<T extends U> {
  lecons: T[];
  faites: number;
  libelle: string;
}

export function grouperUnites<T extends U>(
  unites: T[],
  libelle: (a: { de: number; a: number }) => string,
): Array<Groupe<T>> {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const u of unites) {
    cur.push(u);
    if (u.kind === 'bilan') {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    // examen seul après le dernier bilan : il ferme la dernière unité
    if (out.length && cur.every((u) => u.kind === 'examen')) out[out.length - 1]!.push(...cur);
    else out.push(cur);
  }
  return out.map((lecons) => {
    const nums = lecons.filter((u) => u.kind === 'lecon').map((u) => u.numLecon ?? u.n);
    return {
      lecons,
      faites: lecons.filter((u) => u.statut === 'terminee' || u.statut === 'maitrisee').length,
      libelle: nums.length ? libelle({ de: Math.min(...nums), a: Math.max(...nums) }) : '',
    };
  });
}
